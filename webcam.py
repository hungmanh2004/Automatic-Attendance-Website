# ============================================================
# webcam.py - Nhận diện khuôn mặt THỜI GIAN THỰC từ Camera
# ============================================================
# Luồng hoạt động:
#   1. Mở camera → đọc từng khung hình (MAIN THREAD - luôn mượt)
#   2. Cứ mỗi N khung hình, gửi ảnh sang BACKGROUND THREAD
#   3. Background thread chạy YOLOv8-face + DeepFace + query DB
#   4. Khi có kết quả → cập nhật lại cho main thread vẽ lên màn hình
#   5. Main thread luôn vẽ bounding box từ kết quả mới nhất
#
# [NÂNG CẤP v3] Thay RetinaFace bằng YOLOv8-face (nhanh gấp 3-5x)
#                Thêm Warm-up Model (giảm trễ lần đầu từ 30s → 0s)
# Nhấn 'q' để thoát.
# ============================================================

import cv2
import numpy as np

# ============================================================
# [MỚI v3] Thay RetinaFace bằng YOLOv8-face
# Giải thích: YOLOv8 nhẹ hơn RetinaFace rất nhiều trên CPU.
#   - RetinaFace: ~200-500ms/frame trên CPU → camera giật
#   - YOLOv12-face nano: ~50-100ms/frame trên CPU → mượt hơn 3-5 lần
#
# Cài đặt: pip install yolov8-face
# Thư viện này tự động tải model yolov8n-face.pt khi chạy lần đầu.
# ============================================================
from ultralytics import YOLO

# Import threading để chạy nhận diện ở luồng nền (chống Not Responding)
import threading
import time

# Import các hàm đã tách từ face_recognize.py
from face_recognize import get_db_connection, get_embedding, recognize_face

# ============================================================
# [MỚI v4] Import module ghi nhận điểm danh
# Chức năng: Tự động ghi CSV + đẩy Google Sheets khi nhận diện
# ============================================================
from attendance_logger import AttendanceLogger

# ============================================================
# CẤU HÌNH - Điều chỉnh tùy máy
# ============================================================
FRAME_SKIP = 10               # Chỉ nhận diện mỗi 10 khung hình (~0.3 giây ở 30fps)
CONFIDENCE_THRESHOLD = 0.5    # Độ tin cậy tối thiểu của YOLOv12 khi phát hiện mặt
DISTANCE_THRESHOLD = 0.35     # Ngưỡng cosine distance cho nhận diện (query DB)

# ============================================================
# [MỚI v3] Đường dẫn model YOLOv12-face
# ============================================================
YOLO_FACE_MODEL = "yolov12n-face.pt"

# Màu sắc cho Bounding Box (BGR format cho OpenCV)
COLOR_KNOWN = (0, 255, 0)     # Xanh lá = đã nhận diện được
COLOR_UNKNOWN = (0, 0, 255)   # Đỏ     = không xác định


# ============================================================
# draw_label() - Vẽ Bounding Box + tên người lên khung hình
# ============================================================
def draw_label(frame, x1, y1, x2, y2, label, known=True):
    """Vẽ bounding box và nhãn tên lên khung hình."""
    color = COLOR_KNOWN if known else COLOR_UNKNOWN

    # Vẽ hình chữ nhật bao quanh khuôn mặt (độ dày 2px)
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

    # Tính kích thước text để vẽ nền phía sau
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.7
    thickness = 2
    (text_w, text_h), baseline = cv2.getTextSize(label, font, font_scale, thickness)

    # Vẽ hình chữ nhật nền cho text (ngay dưới bounding box)
    cv2.rectangle(frame, (x1, y2), (x1 + text_w + 4, y2 + text_h + baseline + 4), color, -1)

    # Vẽ text tên người (màu trắng trên nền màu)
    cv2.putText(frame, label, (x1 + 2, y2 + text_h + 2), font, font_scale, (255, 255, 255), thickness)


# ============================================================
# [MỚI v3] detect_and_recognize() - Dùng YOLOv8-face thay RetinaFace
# Giải thích sự khác biệt:
#   - RetinaFace trả về dict: {"face_1": {"facial_area": [x1,y1,x2,y2], ...}}
#   - YOLOv8 trả về list results, mỗi result chứa .boxes với:
#       .xyxy  → tọa độ [x1, y1, x2, y2]
#       .conf  → độ tin cậy (0.0 - 1.0)
# ============================================================
def detect_and_recognize(frame, conn, yolo_model):
    """
    Phát hiện và nhận diện tất cả khuôn mặt trong 1 khung hình.
    Chạy ở background thread để không block camera.

    Args:
        frame:      Khung hình numpy array (BGR).
        conn:       Kết nối psycopg2 tới PostgreSQL.
        yolo_model: Model YOLO đã được load sẵn (không load mỗi lần gọi).
    """
    results = []

    # ============================================================
    # Bước 1: Dùng YOLOv8-face phát hiện khuôn mặt
    # verbose=False để không in log mỗi lần chạy (giữ terminal sạch)
    # ============================================================
    detections = yolo_model(frame, verbose=False)

    # YOLOv8 trả về list, lấy phần tử đầu tiên (ứng với 1 ảnh đầu vào)
    boxes = detections[0].boxes

    # Nếu không phát hiện khuôn mặt nào
    if boxes is None or len(boxes) == 0:
        return results

    # Bước 2: Duyệt qua từng khuôn mặt đã phát hiện
    for i in range(len(boxes)):
        # Lấy độ tin cậy
        conf = float(boxes.conf[i])
        if conf < CONFIDENCE_THRESHOLD:
            continue

        # Lấy tọa độ bounding box [x1, y1, x2, y2]
        x1, y1, x2, y2 = boxes.xyxy[i].cpu().numpy().astype(int)

        # Crop khuôn mặt ra khỏi khung hình
        face_crop = frame[y1:y2, x1:x2]

        if face_crop.size == 0:
            continue

        # Bước 3: Trích xuất embedding bằng ArcFace (qua DeepFace)
        try:
            embedding = get_embedding(face_crop)
        except Exception:
            results.append({
                "box": (x1, y1, x2, y2),
                "name": "Khong xac dinh",
                "known": False
            })
            continue

        # Bước 4: So khớp với database
        try:
            matches = recognize_face(embedding, conn, threshold=DISTANCE_THRESHOLD, top_k=1)
        except Exception:
            results.append({
                "box": (x1, y1, x2, y2),
                "name": "Khong xac dinh",
                "known": False
            })
            continue

        # Bước 5: Xác định kết quả
        if matches:
            name, distance = matches[0]
            results.append({
                "box": (x1, y1, x2, y2),
                "name": f"{name}",
                "known": True
            })
        else:
            results.append({
                "box": (x1, y1, x2, y2),
                "name": "Khong xac dinh",
                "known": False
            })

    return results


# ============================================================
# RecognitionWorker - Luồng nền xử lý nhận diện
# ============================================================
class RecognitionWorker:
    def __init__(self, conn, yolo_model):
        self.conn = conn
        self.yolo_model = yolo_model  # [MỚI v3] Truyền model đã load sẵn vào worker
        self.results = []
        self.is_busy = False
        self._frame = None
        self._lock = threading.Lock()
        self._stop = False

        self._thread = threading.Thread(target=self._worker_loop, daemon=True)
        self._thread.start()

    def submit_frame(self, frame):
        """Gửi 1 khung hình để nhận diện. Bỏ qua nếu đang bận."""
        with self._lock:
            if not self.is_busy:
                self._frame = frame.copy()

    def get_results(self):
        """Lấy kết quả nhận diện mới nhất (thread-safe)."""
        with self._lock:
            return list(self.results)

    def stop(self):
        """Dừng luồng nền."""
        self._stop = True
        self._thread.join(timeout=3)

    def _worker_loop(self):
        """Vòng lặp chạy liên tục ở luồng nền."""
        while not self._stop:
            frame_to_process = None

            with self._lock:
                if self._frame is not None:
                    frame_to_process = self._frame
                    self._frame = None
                    self.is_busy = True

            if frame_to_process is not None:
                # [MỚI v3] Truyền yolo_model vào hàm detect
                new_results = detect_and_recognize(frame_to_process, self.conn, self.yolo_model)

                with self._lock:
                    self.results = new_results
                    self.is_busy = False
            else:
                time.sleep(0.01)


# ============================================================
# [MỚI v3] warm_up_models() - Nạp sẵn AI vào RAM trước khi mở camera
# ============================================================
# Giải thích:
#   Lần đầu tiên gọi YOLO hoặc DeepFace, chúng phải tải model nặng
#   từ ổ cứng vào RAM (~10-30 giây). Nếu không warm-up, camera sẽ
#   hiện lên nhưng 30 giây đầu tiên AI sẽ "đứng hình".
#
#   Bằng cách tạo 1 ảnh giả nhỏ xíu (160x160 pixel đen thui) và
#   cho cả YOLO lẫn DeepFace "xử lý thử" ngay lúc khởi động,
#   mọi model sẽ được nạp sẵn vào bộ nhớ.
#   → Khi camera mở lên, AI nhận diện NGAY LẬP TỨC!
# ============================================================
def warm_up_models(yolo_model):
    """Chạy thử model trên ảnh giả để nạp weights vào RAM."""
    print("Đang nạp mô hình AI vào bộ nhớ...")

    # Tạo ảnh giả nhỏ (160x160 pixel đen)
    dummy_img = np.zeros((160, 160, 3), dtype=np.uint8)

    # Warm-up YOLOv8-face
    print("  [1/2] Nạp YOLOv12n-face...")
    yolo_model(dummy_img, verbose=False)

    # Warm-up DeepFace (ArcFace)
    print("  [2/2] Nạp DeepFace ArcFace...")
    try:
        get_embedding(dummy_img)
    except Exception:
        pass  # Ảnh đen không có mặt → lỗi là bình thường, mục đích chỉ là nạp model

    print("Đã nạp xong tất cả mô hình AI!")


# ============================================================
# MAIN - Vòng lặp Camera chính
# ============================================================
def main():
    # ============================================================
    # [MỚI v3] Load model YOLOv8-face MỘT LẦN DUY NHẤT ở đây
    # Trước đây code cũ gọi YOLO("...") bên trong hàm detect mỗi frame
    # → Load model lại mỗi lần → cực kỳ lãng phí và chậm!
    # ============================================================
    print(f"Đang tải model {YOLO_FACE_MODEL}...")
    yolo_model = YOLO(YOLO_FACE_MODEL)
    print("Đã tải model thành công!")

    # Warm-up: Nạp sẵn AI vào RAM
    warm_up_models(yolo_model)

    print("Đang kết nối tới Database...")
    conn = get_db_connection()
    print("Đã kết nối Database thành công!")

    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        print("Không thể mở Camera. Kiểm tra lại chỉ số hoặc kết nối.")
        conn.close()
        return

    print("Camera đã sẵn sàng. Nhấn 'q' để thoát.")

    # Khởi tạo worker nhận diện ở luồng nền (truyền model đã load)
    worker = RecognitionWorker(conn, yolo_model)
    frame_count = 0

    # ============================================================
    # [MỚI v4] Khởi tạo module ghi nhận điểm danh
    # Kết nối Google Sheets 1 lần, nạp cache từ CSV cũ (nếu có)
    # ============================================================
    logger = AttendanceLogger()

    while True:
        success, frame = cap.read()
        if not success:
            print("Không thể nhận luồng hình ảnh.")
            break

        # Lật gương cho tự nhiên
        frame = cv2.flip(frame, 1)

        # Gửi ảnh sang luồng nền mỗi FRAME_SKIP frame
        frame_count += 1
        if frame_count % FRAME_SKIP == 0:
            worker.submit_frame(frame)
            frame_count = 0

        # Lấy kết quả nhận diện mới nhất
        cached_results = worker.get_results()

        # Vẽ bounding box + tên từ kết quả
        for result in cached_results:
            x1, y1, x2, y2 = result["box"]
            draw_label(frame, x1, y1, x2, y2, result["name"], result["known"])

            # ============================================================
            # [MỚI v4] Ghi nhận điểm danh nếu nhận diện thành công
            # log_attendance() tự kiểm tra trùng lặp trong ngày.
            # Google Sheets được gửi ở luồng nền → camera không bị lag.
            # ============================================================
            if result["known"]:
                logger.log_attendance(result["name"])

        # Hiển thị khung hình (LUÔN MƯỢT vì main thread không bị block)
        cv2.imshow("Face Attendance - Nhan 'q' de thoat", frame)

        # Nhấn 'q' để thoát
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    # Dọn dẹp tài nguyên
    worker.stop()
    logger.shutdown()  # [MỚI v4] Đợi Google Sheets ghi xong rồi mới thoát
    cap.release()
    cv2.destroyAllWindows()
    conn.close()
    print("Đã đóng Camera và Database.")


if __name__ == "__main__":
    main()
