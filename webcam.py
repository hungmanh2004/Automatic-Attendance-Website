# ============================================================
# webcam.py - Nhận diện khuôn mặt THỜI GIAN THỰC từ Camera
# ============================================================
# Luồng hoạt động:
#   1. Mở camera → đọc từng khung hình (MAIN THREAD - luôn mượt)
#   2. Cứ mỗi N khung hình, gửi ảnh sang BACKGROUND THREAD
#   3. Background thread chạy YOLOv12-face + DeepFace + query DB
#   4. Khi có kết quả → cập nhật lại cho main thread vẽ lên màn hình
#   5. Main thread luôn vẽ bounding box từ kết quả mới nhất
#
# [NÂNG CẤP v3] Thay RetinaFace bằng YOLOv12-face (nhanh gấp 3-5x)
#                Thêm Warm-up Model (giảm trễ lần đầu từ 30s → 0s)
# Nhấn 'q' để thoát.
# ============================================================

import cv2
import numpy as np
import psycopg2

# ============================================================
# [MỚI v3] Thay RetinaFace bằng YOLOv12-face
# Giải thích: YOLOv12 nhẹ hơn RetinaFace rất nhiều trên CPU.
#   - RetinaFace: ~200-500ms/frame trên CPU → camera giật
#   - YOLOv12-face nano: ~50-100ms/frame trên CPU → mượt hơn 3-5 lần
#
# Cài đặt: pip install ultralytics
# Model yolov12n-face.pt sẽ được tải tự động khi chạy lần đầu.
# ============================================================
from ultralytics import YOLO

# Import threading để chạy nhận diện ở luồng nền (chống Not Responding)
import threading
import time

# Import các hàm đã tách từ face_recognize.py
from face_recognize import get_db_connection, get_embedding, recognize_face, recognize_faces_batch

# ============================================================
# [MỚI v6] Import module căn chỉnh khuôn mặt
# Giải quyết: Mặt nghiêng → vector sai → "Khong xac dinh"
# Giải pháp: Xoay thẳng mặt bằng YOLOv12 Keypoints trước khi embed
# ============================================================
from face_alignment import align_face

# ============================================================
# [MỚI v4] Import module ghi nhận điểm danh
# Chức năng: Tự động ghi CSV + đẩy Google Sheets khi nhận diện
# ============================================================
from attendance_logger import AttendanceLogger

# ============================================================
# CẤU HÌNH - Điều chỉnh tùy máy
# ============================================================
FRAME_SKIP = 6                # Chỉ nhận diện mỗi 6 khung hình (~0.2 giây ở 30fps)
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
    font_scale = 0.6
    thickness = 2
    (text_w, text_h), baseline = cv2.getTextSize(label, font, font_scale, thickness)

    # 1. Tính toán tọa độ x để căn giữa text so với bounding box
    box_width = x2 - x1
    text_x = x1 + (box_width - text_w) // 2

    # Vẽ hình chữ nhật nền cho text (ngay dưới bounding box)
    cv2.rectangle(frame, (text_x, y2), (text_x + text_w, y2 + text_h + baseline + 4), color, -1)

    # Vẽ text tên người (màu trắng trên nền màu)
    cv2.putText(frame, label, (text_x, y2 + text_h + 2), font, font_scale, (255, 255, 255), thickness)


# ============================================================
# [MỚI v3] detect_and_recognize() - Dùng YOLOv12-face thay RetinaFace
# Giải thích sự khác biệt:
#   - RetinaFace trả về dict: {"face_1": {"facial_area": [x1,y1,x2,y2], ...}}
#   - YOLOv12 trả về list results, mỗi result chứa .boxes với:
#       .xyxy  → tọa độ [x1, y1, x2, y2]
#       .conf  → độ tin cậy (0.0 - 1.0)
# ============================================================
def detect_and_recognize(frame, conn, yolo_model):
    """
    Phát hiện và nhận diện tất cả khuôn mặt trong 1 khung hình.
    Chạy ở background thread để không block camera.

    [MỚI v5] Kiến trúc 2 pha:
      Pha 1: YOLO phát hiện mặt → ArcFace trích embedding cho TẤT CẢ mặt
      Pha 2: Gửi TẤT CẢ embedding lên DB 1 lần duy nhất (batch query)
      → Giảm từ N lần gọi DB xuống còn 1 lần khi thấy N người!

    Args:
        frame:      Khung hình numpy array (BGR).
        conn:       Kết nối psycopg2 tới PostgreSQL.
        yolo_model: Model YOLO đã được load sẵn (không load mỗi lần gọi).
    """
    results = []

    # ============================================================
    # Bước 1: Dùng YOLOv12-face phát hiện khuôn mặt
    # verbose=False để không in log mỗi lần chạy (giữ terminal sạch)
    # ============================================================
    detections = yolo_model(frame, verbose=False)

    # YOLOv12 trả về list, lấy phần tử đầu tiên (ứng với 1 ảnh đầu vào)
    boxes = detections[0].boxes

    # ============================================================
    # [MỚI v6] Lấy keypoints từ YOLOv12 (5 điểm mốc: 2 mắt, mũi, 2 mép)
    # Dùng để xác định góc nghiêng của khuôn mặt và xoay thẳng lại.
    # Nếu model không hỗ trợ keypoints → kps = None → fallback crop thô
    # ============================================================
    kps = getattr(detections[0], 'keypoints', None)

    # Nếu không phát hiện khuôn mặt nào
    if boxes is None or len(boxes) == 0:
        return results

    # ============================================================
    # PHA 1: Thu thập tất cả bounding box + embedding
    # Mỗi khuôn mặt sẽ được crop → trích embedding bằng ArcFace.
    # Những mặt không trích được embedding → đánh dấu "Khong xac dinh".
    # ============================================================
    face_data = []  # List dict {"box": tuple, "embedding": list | None}

    for i in range(len(boxes)):
        # Lấy độ tin cậy
        conf = float(boxes.conf[i])
        if conf < CONFIDENCE_THRESHOLD:
            continue

        # Lấy tọa độ bounding box [x1, y1, x2, y2]
        x1, y1, x2, y2 = boxes.xyxy[i].cpu().numpy().astype(int)

        # ============================================================
        # [MỚI v6] Căn chỉnh khuôn mặt (Face Alignment)
        # Thay vì crop thô frame[y1:y2, x1:x2], ta xoay thẳng mặt
        # dựa trên vị trí 2 mắt từ YOLOv12 Keypoints.
        # Nếu không có keypoints → align_face tự fallback về crop thô.
        # ============================================================
        kp = kps.xy[i].cpu().numpy() if kps is not None else None
        face_crop = align_face(frame, kp, (x1, y1, x2, y2))

        if face_crop.size == 0:
            continue

        # Trích xuất embedding bằng ArcFace (qua DeepFace)
        try:
            embedding = get_embedding(face_crop)
            face_data.append({"box": (x1, y1, x2, y2), "embedding": embedding})
        except Exception:
            # ArcFace không nhận ra mặt → đánh dấu luôn, không cần hỏi DB
            results.append({
                "box": (x1, y1, x2, y2),
                "name": "Khong xac dinh",
                "known": False
            })

    # Nếu không có embedding nào hợp lệ → trả kết quả sớm
    if not face_data:
        return results

    # ============================================================
    # PHA 2: Batch Query - Gửi TẤT CẢ embedding lên DB 1 LẦN
    # ============================================================
    # [MỚI v5] Cho lỗi kết nối DB lan ra ngoài (KHÔNG nuốt)
    # Lý do: Nếu except Exception bắt hết, Worker sẽ không biết
    #        DB đã đứt → AI "mù" vĩnh viễn mà không báo lỗi.
    #        Bây giờ lỗi DB sẽ truyền lên _worker_loop để tự reconnect.
    # ============================================================
    embeddings = [fd["embedding"] for fd in face_data]

    try:
        batch_results = recognize_faces_batch(
            embeddings, conn, threshold=DISTANCE_THRESHOLD, top_k=1
        )
    except (psycopg2.OperationalError, psycopg2.InterfaceError):
        raise  # Để lỗi DB lan ra → Worker sẽ tự reconnect
    except Exception:
        # Lỗi khác (SQL syntax, etc.) → đánh dấu tất cả là unknown
        for fd in face_data:
            results.append({
                "box": fd["box"],
                "name": "Khong xac dinh",
                "known": False
            })
        return results

    # Bước 3: Ghép kết quả DB với bounding box
    for i, fd in enumerate(face_data):
        matches = batch_results[i]
        if matches:
            name, distance = matches[0]
            results.append({
                "box": fd["box"],
                "name": f"{name}",
                "known": True
            })
        else:
            results.append({
                "box": fd["box"],
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
        self._reconnect_attempts = 0  # [MỚI v5] Đếm số lần thử kết nối lại DB

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

    # ============================================================
    # [MỚI v5] _try_reconnect() - Tự động kết nối lại Database
    # ============================================================
    # Giải thích:
    #   Khi mạng chập chờn, kết nối tới Aiven Cloud sẽ đứt.
    #   Thay vì để AI "mù" vĩnh viễn, hàm này sẽ:
    #   1. Đóng kết nối cũ (đã chết)
    #   2. Tạo kết nối mới
    #   3. Nếu thất bại → đợi lâu dần (2s, 4s, 8s) rồi thử lại
    #   4. Sau 3 lần liên tiếp thất bại → tạm dừng 10s rồi thử vòng mới
    # ============================================================
    def _try_reconnect(self):
        """Thử kết nối lại Database khi bị đứt. Trả về True nếu thành công."""
        MAX_ATTEMPTS = 3
        self._reconnect_attempts += 1

        if self._reconnect_attempts > MAX_ATTEMPTS:
            print(f"[RecognitionWorker] ❌ Đã thử kết nối lại {MAX_ATTEMPTS} lần liên tiếp thất bại.")
            print("[RecognitionWorker]    Nhận diện tạm dừng. Sẽ thử lại sau 10 giây...")
            time.sleep(10)
            self._reconnect_attempts = 0  # Reset để thử lại vòng mới
            return False

        wait_seconds = 2 ** self._reconnect_attempts  # Exponential backoff: 2s, 4s, 8s
        print(f"[RecognitionWorker] ⚠️ Mất kết nối Database! Đang thử kết nối lại... "
              f"(lần {self._reconnect_attempts}/{MAX_ATTEMPTS}, đợi {wait_seconds}s)")

        time.sleep(wait_seconds)

        try:
            # Đóng kết nối cũ (nếu chưa đóng)
            try:
                self.conn.close()
            except Exception:
                pass

            self.conn = get_db_connection()
            self._reconnect_attempts = 0
            print("[RecognitionWorker] ✅ Đã kết nối lại Database thành công!")
            return True
        except Exception as e:
            print(f"[RecognitionWorker] ❌ Kết nối lại thất bại: {e}")
            return False

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
                try:
                    # [MỚI v3] Truyền yolo_model vào hàm detect
                    new_results = detect_and_recognize(frame_to_process, self.conn, self.yolo_model)
                    self._reconnect_attempts = 0  # Query thành công → reset bộ đếm
                except (psycopg2.OperationalError, psycopg2.InterfaceError):
                    # ============================================================
                    # [MỚI v5] Auto-Reconnect khi DB bị đứt
                    # Thay vì "mù" vĩnh viễn, Worker sẽ tự cấp cứu đường truyền.
                    # ============================================================
                    new_results = []
                    if self._try_reconnect():
                        # Kết nối lại thành công → thử nhận diện lại frame này
                        try:
                            new_results = detect_and_recognize(
                                frame_to_process, self.conn, self.yolo_model
                            )
                        except Exception:
                            pass  # Nếu vẫn lỗi → bỏ frame này, đợi frame sau

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
    # [MỚI v3] Load model YOLOv12-face MỘT LẦN DUY NHẤT ở đây
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

    # ============================================================
    # [MỚI v5] Đóng kết nối DB an toàn
    # Lý do đóng cả 2: Nếu Worker đã tự reconnect, conn gốc và
    # worker.conn là 2 đối tượng khác nhau, cần đóng cả hai.
    # ============================================================
    for c in (conn, worker.conn):
        try:
            if not c.closed:
                c.close()
        except Exception:
            pass
    print("Đã đóng Camera và Database.")


if __name__ == "__main__":
    main()
