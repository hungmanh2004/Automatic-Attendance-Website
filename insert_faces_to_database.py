# ============================================================
# insert_faces_to_database.py - Thêm nhân viên mới vào Database
# ============================================================
# Chức năng:
#   1. Đọc ảnh nhân viên từ thư mục employees/
#   2. Phát hiện và crop khuôn mặt (RetinaFace)
#   3. Trích xuất embedding 512 chiều (ArcFace) - tái sử dụng từ face_recognize.py
#   4. Lưu vào PostgreSQL (pgvector)
#
# Sử dụng:
#   python insert_faces_to_database.py "employees/Le Xuan Dai.jpg"
#   python insert_faces_to_database.py  (sẽ hỏi đường dẫn)
# ============================================================

import sys
import os
import cv2
from retinaface import RetinaFace

# Tái sử dụng hàm đã có sẵn thay vì viết lại
from face_recognize import get_db_connection, get_embedding

# ============================================================
# CẤU HÌNH
# ============================================================
STORED_FACES_FOLDER = "stored-faces"
FACE_CONFIDENCE_THRESHOLD = 0.8  # Chỉ lấy khuôn mặt có độ chắc chắn > 80%


def detect_and_crop_face(img_path):
    """
    Đọc ảnh, phát hiện khuôn mặt, crop và lưu vào thư mục stored-faces/.

    Args:
        img_path: Đường dẫn tới ảnh nhân viên gốc.

    Returns:
        str:  Đường dẫn tới file ảnh đã crop (trong stored-faces/).
        None: Nếu không tìm thấy khuôn mặt hoặc ảnh bị lỗi.
    """
    img = cv2.imread(img_path)
    if img is None:
        print(f"❌ Không thể đọc ảnh từ {img_path}")
        return None

    os.makedirs(STORED_FACES_FOLDER, exist_ok=True)

    # RetinaFace trả về dict nếu tìm thấy mặt, tuple rỗng nếu không
    faces = RetinaFace.detect_faces(img)
    if not isinstance(faces, dict):
        print("❌ Không tìm thấy khuôn mặt nào trong ảnh.")
        return None

    filename = os.path.basename(img_path)

    for key, face_info in faces.items():
        score = face_info["score"]
        if score < FACE_CONFIDENCE_THRESHOLD:
            continue

        # RetinaFace trả về [x1, y1, x2, y2]
        x1, y1, x2, y2 = face_info["facial_area"]
        cropped_image = img[y1:y2, x1:x2]

        if cropped_image.size == 0:
            continue

        target_path = os.path.join(STORED_FACES_FOLDER, filename)
        cv2.imwrite(target_path, cropped_image)
        print(f"  Đã crop và lưu khuôn mặt: {target_path}")
        return target_path  # Lấy khuôn mặt đầu tiên đủ tin cậy

    print("❌ Không có khuôn mặt nào đủ độ tin cậy (>80%).")
    return None


def insert_face_to_db(cropped_img_path):
    """
    Trích xuất embedding từ ảnh đã crop và lưu vào Database.

    Args:
        cropped_img_path: Đường dẫn tới ảnh khuôn mặt đã crop.
    """
    filename = os.path.basename(cropped_img_path)
    person_name = os.path.splitext(filename)[0]

    conn = get_db_connection()
    cur = conn.cursor()

    try:
        # Tái sử dụng get_embedding() từ face_recognize.py
        # (không cần viết lại DeepFace.represent thủ công)
        embedding = get_embedding(cropped_img_path)

        cur.execute("INSERT INTO pictures VALUES (%s, %s)", (person_name, embedding))
        conn.commit()
        print(f"  ✅ Đã thêm '{person_name}' vào Database thành công!")
    except Exception as e:
        print(f"  ❌ Lỗi khi xử lý {filename}: {e}")
    finally:
        cur.close()
        conn.close()


def main():
    """Điểm vào chính - đọc đường dẫn từ argument hoặc hỏi user."""
    # Nhận đường dẫn ảnh từ command line hoặc hỏi trực tiếp
    if len(sys.argv) > 1:
        img_path = sys.argv[1]
    else:
        img_path = input("Nhập đường dẫn ảnh nhân viên: ").strip()

    if not os.path.exists(img_path):
        print(f"❌ Không tìm thấy file: {img_path}")
        return

    # Hiển thị số khuôn mặt hiện có
    if os.path.exists(STORED_FACES_FOLDER):
        count = len(os.listdir(STORED_FACES_FOLDER))
        print(f"Trong database đang có {count} khuôn mặt.")

    # Bước 1: Phát hiện và crop khuôn mặt
    print(f"\n[1/2] Đang phát hiện khuôn mặt trong ảnh...")
    cropped_path = detect_and_crop_face(img_path)
    if cropped_path is None:
        return

    # Bước 2: Tạo embedding và lưu vào DB
    print(f"[2/2] Đang tạo embedding và lưu vào Database...")
    insert_face_to_db(cropped_path)

    # Hiển thị số khuôn mặt sau khi thêm
    count = len(os.listdir(STORED_FACES_FOLDER))
    print(f"\nTrong database từ giờ sẽ có {count} khuôn mặt.")


if __name__ == "__main__":
    main()