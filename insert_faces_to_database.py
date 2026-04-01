# ============================================================
# insert_faces_to_database.py - Thêm nhân viên mới vào Database
# ============================================================
# Chức năng:
#   1. Đọc ảnh nhân viên từ thư mục employees/
#   2. Phát hiện và crop khuôn mặt (YOLOv12-face + Alignment)
#   3. Trích xuất embedding 512 chiều (ArcFace) - tái sử dụng từ face_recognize.py
#   4. Lưu vào PostgreSQL (pgvector)
#
# [MỚI v6] Đổi từ RetinaFace sang YOLOv12-face + Face Alignment
# Lý do: Đồng bộ cùng chuẩn xử lý ảnh với webcam.py
#        → Vector trong DB cùng "hệ quy chiếu" với vector webcam
#        → Matching chính xác hơn nhiều!
#
# Sử dụng:
#   python insert_faces_to_database.py "employees/Le Xuan Dai.jpg"
#   python insert_faces_to_database.py  (sẽ hỏi đường dẫn)
# ============================================================

import sys
import os
import cv2
from ultralytics import YOLO

# Tái sử dụng hàm đã có sẵn thay vì viết lại
from face_recognize import get_db_connection, get_embedding
from face_alignment import align_face

# ============================================================
# CẤU HÌNH
# ============================================================
STORED_FACES_FOLDER = "stored-faces"
FACE_CONFIDENCE_THRESHOLD = 0.5  # Đồng bộ với webcam.py
YOLO_FACE_MODEL = "yolov12n-face.pt"  # Cùng model với webcam.py


def detect_and_crop_face(img_path, yolo_model):
    """
    Đọc ảnh, phát hiện khuôn mặt bằng YOLOv12, căn chỉnh và lưu.

    [MỚI v6] Dùng YOLOv12-face + Face Alignment thay RetinaFace.
    Đảm bảo ảnh mẫu trong DB dùng cùng chuẩn xử lý với webcam live.

    Args:
        img_path:   Đường dẫn tới ảnh nhân viên gốc.
        yolo_model: Model YOLO đã load sẵn.

    Returns:
        str:  Đường dẫn tới file ảnh đã align (trong stored-faces/).
        None: Nếu không tìm thấy khuôn mặt hoặc ảnh bị lỗi.
    """
    img = cv2.imread(img_path)
    if img is None:
        print(f"❌ Không thể đọc ảnh từ {img_path}")
        return None

    os.makedirs(STORED_FACES_FOLDER, exist_ok=True)

    # Dùng YOLOv12-face (cùng model với webcam.py)
    detections = yolo_model(img, verbose=False)
    boxes = detections[0].boxes
    kps = getattr(detections[0], 'keypoints', None)

    if boxes is None or len(boxes) == 0:
        print("❌ Không tìm thấy khuôn mặt nào trong ảnh.")
        return None

    filename = os.path.basename(img_path)

    for i in range(len(boxes)):
        conf = float(boxes.conf[i])
        if conf < FACE_CONFIDENCE_THRESHOLD:
            continue

        # Lấy bounding box
        x1, y1, x2, y2 = boxes.xyxy[i].cpu().numpy().astype(int)

        # [MỚI v6] Dùng Face Alignment thay vì crop thô
        kp = kps.xy[i].cpu().numpy() if kps is not None else None
        aligned_face = align_face(img, kp, (x1, y1, x2, y2))

        if aligned_face.size == 0:
            continue

        target_path = os.path.join(STORED_FACES_FOLDER, filename)
        cv2.imwrite(target_path, aligned_face)
        print(f"  Đã căn chỉnh và lưu khuôn mặt: {target_path}")
        return target_path  # Lấy khuôn mặt đầu tiên đủ tin cậy

    print("❌ Không có khuôn mặt nào đủ độ tin cậy.")
    return None


def insert_face_to_db(cropped_img_path, conn):
    """
    Trích xuất embedding từ ảnh đã căn chỉnh và lưu vào Database.

    Args:
        cropped_img_path: Đường dẫn tới ảnh khuôn mặt đã align.
        conn: Kết nối psycopg2 đã được thiết lập sẵn.
    """
    filename = os.path.basename(cropped_img_path)
    person_name = os.path.splitext(filename)[0]

    cur = conn.cursor()

    try:
        # Tái sử dụng get_embedding() từ face_recognize.py
        embedding = get_embedding(cropped_img_path)

        cur.execute("INSERT INTO pictures VALUES (%s, %s)", (person_name, embedding))
        conn.commit()
        print(f"  ✅ Đã thêm '{person_name}' vào Database thành công!")
    except Exception as e:
        print(f"  ❌ Lỗi khi xử lý {filename}: {e}")
        # Có thể thêm cờ báo xóa ảnh rác (nếu cần) ở đây!
    finally:
        cur.close()


def main():
    """Điểm vào chính - đọc đường dẫn từ argument hoặc hỏi user."""
    # Nhận đường dẫn ảnh từ command line hoặc hỏi trực tiếp
    if len(sys.argv) > 1:
        folder_path = sys.argv[1]
    else:
        folder_path = input("Nhập đường dẫn thư mục ảnh nhân viên (vd: employees/Tran Manh Hung): ").strip()

    if not os.path.exists(folder_path):
        print(f"❌ Không tìm thấy thư mục: {folder_path}")
        return

    # Hiển thị số khuôn mặt hiện có
    if os.path.exists(STORED_FACES_FOLDER):
        count = len(os.listdir(STORED_FACES_FOLDER))
        print(f"Trong database đang có {count} khuôn mặt.")

    # Load model YOLOv12-face (chỉ load 1 lần TRƯỚC VÒNG LẶP)
    print(f"Đang tải model {YOLO_FACE_MODEL}...")
    yolo_model = YOLO(YOLO_FACE_MODEL)
    
    # Kết nối DB (chỉ tạo kết nối 1 lần TRƯỚC VÒNG LẶP)
    print("Đang kết nối Database...")
    conn = get_db_connection()

    for filename in os.listdir(folder_path):
        # Bỏ qua các file ẩn/khác ảnh (.DS_Store...)
        if filename.startswith('.'):
            continue
            
        img_path = os.path.join(folder_path, filename)
        print(f"\n--- Đang xử lý: {filename} ---")

        # Bước 1: Phát hiện, căn chỉnh và lưu khuôn mặt
        print(f"[1/2] Đang phát hiện và căn chỉnh khuôn mặt...")
        cropped_path = detect_and_crop_face(img_path, yolo_model)
        if cropped_path is None:
            continue  # Bỏ qua nếu lỗi, tiếp tục với ảnh khác

        # Bước 2: Tạo embedding và lưu vào DB
        print(f"[2/2] Đang tạo embedding và lưu vào Database...")
        insert_face_to_db(cropped_path, conn)
        
    conn.close()

    # Hiển thị số khuôn mặt sau khi thêm
    count = len(os.listdir(STORED_FACES_FOLDER))
    print(f"\n✅ Hoàn tất! Trong database từ giờ sẽ có {count} khuôn mặt.")


if __name__ == "__main__":
    main()