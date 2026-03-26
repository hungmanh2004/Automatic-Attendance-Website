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
# [MỚI v5] recognize_faces_batch() - Gộp N câu hỏi DB thành 1
# ============================================================
# Giải thích vấn đề N+1 Query:
#   Trước đây: Camera thấy 5 người → Gọi DB 5 lần liên tiếp.
#              Mỗi lần gọi mất ~20-50ms do mạng (Aiven Cloud).
#              → Tổng: 5 × 50ms = 250ms chỉ để đợi mạng!
#
#   Bây giờ:   Camera thấy 5 người → Gộp 5 vector thành 1 gói,
#              gửi lên DB 1 lần duy nhất → Trả về 5 kết quả.
#              → Tổng: 1 × 50ms = 50ms! (nhanh gấp 5 lần)
#
# Kỹ thuật: Dùng CROSS JOIN LATERAL để PostgreSQL tìm
#           top_k người gần nhất cho MỖI vector trong 1 câu SQL.
# ============================================================
def recognize_faces_batch(embeddings, conn, threshold=0.35, top_k=1):
    """
    So khớp NHIỀU embedding cùng lúc với database (1 câu SQL duy nhất).

    Args:
        embeddings:  List các vector 512 chiều (list of list[float]).
        conn:        Kết nối psycopg2 tới PostgreSQL.
        threshold:   Ngưỡng cosine distance tối đa.
        top_k:       Số kết quả trả về tối đa cho mỗi khuôn mặt.

    Returns:
        list[list[tuple]]: Mỗi phần tử ứng với 1 embedding đầu vào,
                           chứa list các (tên_người, cosine_distance).
                           Trả về [] cho embedding không khớp ai.
    """
    if not embeddings:
        return []

    # Nếu chỉ có 1 người → dùng hàm đơn lẻ cho đơn giản
    if len(embeddings) == 1:
        return [recognize_face(embeddings[0], conn, threshold, top_k)]

    cur = conn.cursor()

    # Xây dựng VALUES clause: (0, '[...]'::vector), (1, '[...]'::vector), ...
    values_parts = []
    params = []
    for idx, emb in enumerate(embeddings):
        string_repr = "[" + ",".join(str(x) for x in emb) + "]"
        values_parts.append(f"({idx}, %s::vector)")
        params.append(string_repr)

    values_clause = ", ".join(values_parts)

    # Thêm threshold và top_k vào params
    params.extend([threshold, top_k])

    # ============================================================
    # CROSS JOIN LATERAL:
    #   Với MỖI vector trong query_vectors, PostgreSQL sẽ:
    #   1. Tính cosine distance tới TẤT CẢ khuôn mặt trong bảng
    #   2. Lọc theo threshold
    #   3. Lấy top_k người gần nhất
    #   Tất cả trong 1 câu SQL duy nhất!
    # ============================================================
    query = f"""
        WITH query_vectors(idx, vec) AS (
            VALUES {values_clause}
        )
        SELECT qv.idx, matched.person_name, matched.distance
        FROM query_vectors qv
        CROSS JOIN LATERAL (
            SELECT
                p.picture AS person_name,
                p.embedding <=> qv.vec AS distance
            FROM pictures p
            WHERE p.embedding <=> qv.vec <= %s
            ORDER BY p.embedding <=> qv.vec ASC
            LIMIT %s
        ) matched
        ORDER BY qv.idx, matched.distance;
    """

    cur.execute(query, params)
    rows = cur.fetchall()
    cur.close()

    # Gom kết quả theo index (thứ tự tương ứng embedding đầu vào)
    results_by_idx = {}
    for row in rows:
        idx = row[0]          # Index ứng với embedding nào
        person_name = row[1]  # Tên người
        distance = row[2]     # Cosine distance
        if idx not in results_by_idx:
            results_by_idx[idx] = []
        results_by_idx[idx].append((person_name, distance))

    # Trả về list đúng thứ tự đầu vào, embedding nào không khớp → []
    return [results_by_idx.get(i, []) for i in range(len(embeddings))]


# ============================================================
# Phần chạy trực tiếp - giữ nguyên logic cũ để test độc lập
# Chạy: python face_recognize.py
# ============================================================
if __name__ == "__main__":
    
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