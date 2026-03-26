# ============================================================
# face_recognize.py - Module nhận diện khuôn mặt
# ============================================================
# File này cung cấp các hàm tái sử dụng để:
#   1. Kết nối tới Database PostgreSQL (Aiven Cloud)
#   2. Trích xuất embedding từ ảnh khuôn mặt (DeepFace + ArcFace)
#   3. So khớp embedding với các khuôn mặt đã đăng ký trong DB
#
# Có thể chạy trực tiếp (python face_recognize.py) để test,
# hoặc import từ file khác (vd: webcam.py).
# ============================================================

# importing the required libraries
import numpy as np
from deepface import DeepFace
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

# ============================================================
# [HÀM MỚI] Chuỗi kết nối Database - Tách ra để dùng chung
# ============================================================
DB_CONNECTION_STRING = os.getenv("AIVEN_PATH")

# ============================================================
# [HÀM MỚI] get_db_connection()
# Chức năng: Tạo và trả về kết nối tới PostgreSQL
# Dùng khi: webcam.py cần kết nối DB để query khuôn mặt
# ============================================================
def get_db_connection():
    """Tạo kết nối tới PostgreSQL database trên Aiven Cloud."""
    conn = psycopg2.connect(DB_CONNECTION_STRING)
    return conn

# ============================================================
# [HÀM MỚI] get_embedding(img_path)
# Chức năng: Nhận đường dẫn ảnh hoặc numpy array, trả về
#            vector embedding 512 chiều (ArcFace)
# Input:     img_path - đường dẫn file ảnh HOẶC numpy array (BGR)
# Output:    list[float] gồm 512 phần tử
# ============================================================
def get_embedding(img_path):
    """
    Trích xuất embedding vector 512 chiều từ ảnh khuôn mặt.
    
    Args:
        img_path: Đường dẫn tới file ảnh, hoặc numpy array (BGR).
                  Ảnh nên đã được crop sẵn chỉ chứa khuôn mặt.
    
    Returns:
        list[float]: Vector embedding 512 chiều.
    """
    embedding_objs = DeepFace.represent(
        img_path=img_path,
        model_name="ArcFace",
        enforce_detection=False  # Không cần detect lại vì ảnh đã crop sẵn
    )
    # Lấy vector embedding của khuôn mặt đầu tiên
    embedding = embedding_objs[0]["embedding"]
    return embedding

# ============================================================
# [HÀM MỚI] recognize_face(embedding, conn, threshold=0.35, top_k=1)
# Chức năng: Gửi embedding lên DB, tìm khuôn mặt giống nhất
# Input:     embedding  - vector 512 chiều (từ get_embedding)
#            conn       - kết nối psycopg2 (từ get_db_connection)
#            threshold  - ngưỡng cosine distance (mặc định 0.35)
#            top_k      - số kết quả tối đa trả về
# Output:    list[tuple] - mỗi tuple gồm (tên_người, distance)
#            Trả về list rỗng [] nếu không tìm thấy ai
# ============================================================
def recognize_face(embedding, conn, threshold=0.35, top_k=1):
    """
    So khớp embedding với database, trả về danh sách người giống nhất.
    
    Args:
        embedding:  Vector 512 chiều (list of floats).
        conn:       Kết nối psycopg2 tới PostgreSQL.
        threshold:  Ngưỡng cosine distance tối đa (càng nhỏ càng giống).
        top_k:      Số kết quả trả về tối đa.
    
    Returns:
        list[tuple]: Mỗi phần tử là (tên_người, cosine_distance).
                     Trả về [] nếu không ai đủ gần ngưỡng.
    """
    cur = conn.cursor()
    
    # Chuyển embedding thành chuỗi vector cho pgvector
    string_representation = "[" + ",".join(str(x) for x in embedding) + "]"
    
    # Query tìm khuôn mặt gần nhất bằng cosine distance (toán tử <=>)
    cur.execute("""
        WITH ranked AS (
        SELECT
            *,
            embedding <=> %s::vector AS distance
        FROM pictures
        )
        SELECT *
        FROM ranked
        WHERE distance <= %s
        ORDER BY distance ASC
        LIMIT %s;
        """, (string_representation, threshold, top_k))
    
    rows = cur.fetchall()
    cur.close()
    
    # Trả về list các tuple (tên, distance)
    results = []
    for row in rows:
        filename = row[0]     # Cột đầu tiên: tên người
        distance = row[-1]    # Cột cuối cùng: cosine distance
        results.append((filename, distance))
    
    return results


# ============================================================
# Phần chạy trực tiếp - giữ nguyên logic cũ để test độc lập
# Chạy: python face_recognize.py
# ============================================================
if __name__ == "__main__":
    import cv2
    import os
    from retinaface import RetinaFace
    
    # Ảnh test
    img = "face-test/henry-test.png"
    
    # Lấy embedding từ ảnh test
    embedding = get_embedding(img)
    
    # Kết nối DB và tìm kiếm
    conn = get_db_connection()
    results = recognize_face(embedding, conn, threshold=0.35, top_k=20)
    
    if not results:
        print("Không có ảnh nào đủ gần theo threshold.")
    else:
        for filename, distance in results:
            print(f"{filename} | distance={distance:.4f}")
    
    conn.close()