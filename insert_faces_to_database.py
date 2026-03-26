import cv2
import os
from retinaface import RetinaFace
from dotenv import load_dotenv

load_dotenv()

## Thêm ảnh mới vào danh sách nhân viên ##

# Ảnh mới
path = "employees/Le Xuan Dai.jpg"
filename = os.path.basename(path)

# Đọc ảnh
img = cv2.imread(path)
# Kiểm tra nếu không đọc được ảnh
if img is None:
    print(f"Không thể đọc ảnh từ {path}")
    exit()

# Tạo thư mục chứa ảnh nếu chưa có
os.makedirs('stored-faces', exist_ok=True)

# Tìm kiếm khuôn mặt
# Trả về một dictionary chứa thông tin các khuôn mặt (tọa độ, điểm mốc, độ tin cậy)
faces = RetinaFace.detect_faces(img)



# Số nhân viên hiện có trong database
count = len(os.listdir('stored-faces'))
        
print(f"Trong database đang có {count} khuôn mặt.")

# Nếu không tìm thấy mặt, RetinaFace có thể trả về tuple rỗng, nên cần kiểm tra type là dict
if isinstance(faces, dict):
    # Duyệt qua các khuôn mặt tìm thấy
    for key, face_info in faces.items():
        # Lấy độ tin cậy (score) để lọc các khuôn mặt bị nhận diện nhầm (tuỳ chọn)
        score = face_info["score"]
        if score < 0.8: # Chỉ lấy các khuôn mặt có độ chắc chắn > 80%
            continue
            
        # Lấy tọa độ khuôn mặt
        # Lưu ý: RetinaFace trả về [x1, y1, x2, y2] thay vì [x, y, w, h] như Haar Cascade
        x1, y1, x2, y2 = face_info["facial_area"]
        
        # Crop ảnh để lấy mỗi mặt (Y trước, X sau)
        cropped_image = img[y1:y2, x1:x2]
        
        # Kiểm tra xem ảnh crop có bị lỗi kích thước không
        if cropped_image.size == 0:
            continue
            
        # Lưu ảnh
        target_file_name = os.path.join('stored-faces', filename)
        cv2.imwrite(target_file_name, cropped_image)
        count += 1
        
    print(f"Đã lưu thành công. Trong database từ giờ sẽ có {count} khuôn mặt.")
else:
    print("Không tìm thấy khuôn mặt nào trong ảnh.")
    

# importing the required libraries
import numpy as np
from deepface import DeepFace
import psycopg2

# connecting to the database
conn = psycopg2.connect(os.getenv("AIVEN_PATH"))
cur = conn.cursor()

folder_path = "stored-faces"

img_path = os.path.join(folder_path, filename)

# Lấy tên người từ file (Henry Cavill)
person_name = os.path.splitext(filename)[0]

try:
    # Trích xuất embedding sử dụng mô hình ArcFace
    # Trả về một list các dict, ta lấy embedding của khuôn mặt đầu tiên [0]
    # enforce_detection=False vì ảnh đã được crop sẵn từ trước
    embedding_objs = DeepFace.represent(
        img_path=img_path, 
        model_name="ArcFace",
        enforce_detection=False
    )
        
    # Lấy vector (list gồm 512 chiều đối với ArcFace)
    embedding = embedding_objs[0]["embedding"]
        
    # Lưu vào Database
    cur.execute("INSERT INTO pictures VALUES (%s, %s)", (person_name, embedding))
    print(f"Đã tạo vector thành công cho: {filename}")
        
except Exception as e:
    print(f"Lỗi khi xử lý {filename}: {e}")

conn.commit()
cur.close()
conn.close()