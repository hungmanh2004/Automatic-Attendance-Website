## 1. Tổng Quan Dự Án
- **Loại ứng dụng:** Desktop/Webcam App
- **Trạng thái:** Đang phát triển (In Development)
- **Ngôn ngữ lập trình chính:** Python (100%)
- **Mục tiêu:** Xây dựng một hệ thống điểm danh tự động theo thời gian thực sử dụng camera, kết hợp các mô hình AI nhận diện khuôn mặt tiên tiến và lưu trữ dữ liệu đồng bộ lên đám mây.

## 2. Tech Stack
- **Ngôn ngữ:** Python
- **AI & Computer Vision:** 
  - **YOLOv12-face:** Dùng để phát hiện khuôn mặt (Face Detection) và trích xuất các điểm đặc trưng (Keypoints).
  - **ArcFace:** Dùng để trích xuất đặc trưng khuôn mặt (Face Recognition) thành vector 512 chiều.
- **Cơ sở dữ liệu:** PostgreSQL kết hợp extension `pgvector` để lưu trữ và tìm kiếm vector nhúng.
- **Tích hợp bên thứ 3:** Google Sheets API (thông qua thư viện `gspread`) để báo cáo và đồng bộ dữ liệu điểm danh.

## 3. Các Tính Năng Cốt Lõi
1. **Nhận diện thời gian thực:** Quét và nhận diện khuôn mặt liên tục từ luồng camera sử dụng cơ chế Đa luồng (Multi-threading).
2. **Căn chỉnh khuôn mặt (Face Alignment):** Tự động xoay và chuẩn hóa khuôn mặt dựa trên tọa độ Keypoints từ YOLOv12 bằng phép biến đổi Affine để tăng độ chính xác khi nhận diện.
3. **Trích xuất Embedding:** Chuyển đổi hình ảnh khuôn mặt thành vector toán học 512 chiều thông qua mô hình ArcFace.
4. **Tìm kiếm Vector:** Sử dụng thuật toán đo khoảng cách Cosine trên PostgreSQL pgvector để so khớp khuôn mặt nhanh chóng.
5. **Cơ chế chống lặp (Anti-spam):** Kết hợp bộ nhớ tạm (In-memory Cache) và đồng bộ file CSV để ngăn chặn việc ghi log liên tục cho cùng một người trong một ngày.
6. **Đồng bộ đám mây:** Ghi nhận lịch sử điểm danh trực tiếp lên Google Sheets chạy hoàn toàn trên luồng nền (background thread).

## 4. Thiết Kế Cơ Sở Dữ Liệu
Hệ thống sử dụng PostgreSQL tối ưu cho lưu trữ vector.
- **Bảng `faces`**:
  - `picture (text) (PK)`: Tên người (được sử dụng làm định danh duy nhất khi ghi log điểm danh).
  - `embedding (vector)`: Lưu trữ vector 512 chiều của khuôn mặt sinh ra từ ArcFace.

## 5. Quy Tắc Nghiệp Vụ
- **Ghi nhận điểm danh:** Khi hệ thống nhận diện thành công một người, thông tin về thời gian (giờ/ngày) sẽ được ghi ngay lập tức vào file CSV cục bộ và đẩy lên Google Sheets.
- **Chống spam dữ liệu:** Nếu một người đã được điểm danh trong ngày, hệ thống sẽ tự động bỏ qua các lần nhận diện tiếp theo của người đó trong cùng ngày hôm đó để tránh rác dữ liệu.

## 6. Giải Pháp Kỹ Thuật & Tối Ưu Hiệu Năng

### 6.1. Xử lý Đa luồng & Chống đơ giao diện
- **Vấn đề:** Các tác vụ phân tích AI (ArcFace) và gọi API lên Google Sheets có độ trễ lớn (từ 1 đến 3 giây). Nếu chạy trên Main Thread, luồng camera sẽ bị đóng băng.
- **Giải pháp:** Áp dụng kiến trúc **Drop-if-busy** để xử lý hình ảnh từ `VideoCapture`. Các tác vụ nặng bắt buộc được đẩy vào `RecognitionWorker` và quản lý bằng `ThreadPoolExecutor` để đảm bảo luồng UI (camera) luôn mượt mà.

### 6.2. Tối ưu hóa truy vấn Database (Batch Query pgvector)
- **Giải pháp giải quyết bài toán N+1:** Thay vì truy vấn so khớp từng khuôn mặt một, hệ thống gom nhóm (batching) sử dụng cấu trúc `VALUES (idx, vec)` kết hợp với `CROSS JOIN LATERAL` trong PostgreSQL. Điều này giúp lấy ra `top_k` kết quả đối sánh cho nhiều khuôn mặt trong một truy vấn duy nhất, giảm thiểu đáng kể độ trễ mạng.

### 6.3. Tối ưu hóa Face Alignment
- Phép biến đổi cắt xoay (`warpAffine`) được tối ưu hóa để chạy nhẹ nhàng trên CPU. Hệ thống **chỉ xoay phần ảnh khuôn mặt đã được cắt (crop) và đệm (padding)**, tuyệt đối không áp dụng phép xoay lên toàn bộ khung hình lớn của camera để tiết kiệm tài nguyên tính toán.

### 6.4. Xử lý Lỗi & Khả năng phục hồi
- **Kết nối Database:** Khi làm việc với Cloud Database (như Aiven PG), kết nối mạng thường có rủi ro bị đứt ngầm.
- **Khắc phục:** Hệ thống được thiết kế để bắt chính xác lỗi `psycopg2.OperationalError` và thực hiện cơ chế **Auto-reconnect** (tự động kết nối lại) ở cấp độ thư viện. Điều này khắc phục tình trạng "mù vĩnh viễn" của ứng dụng so với việc chỉ dùng khối `except Exception` chung chung.

## 7. Đánh giá thử nghiệm thực tế

- Qua 20 lượt kiểm thử thực tế, hiệu suất của thuật toán có sự phân hóa rõ rệt dựa trên mức độ che khuất (occlusion) của khuôn mặt. Với các mẫu thử sạch (không kính, không tóc mái), thời gian phản hồi đạt mức lý tưởng từ 1-3s. Khi xuất hiện yếu tố che khuất tĩnh như kính mắt, hệ thống cần xử lý từ 5-6 frames trong khoảng 5-7s để hội tụ kết quả. Đặc biệt, trong điều kiện che khuất phức hợp (kính kết hợp tóc mái che khuất vùng lông mày/mắt), tỷ lệ nhận diện thành công giảm tiệm cận 0, tốn khoảng 30s chỉ để bắt được 1-2 lần khớp.
- ***Kết luận:*** Hiện tượng nhiễu bề mặt do vật cản (kính, tóc, khẩu trang,...) đã làm suy giảm khả năng định vị các facial landmarks trọng yếu. Hậu quả là mô hình ArcFace không thể trích xuất được vector embedding toàn vẹn, làm giảm mạnh độ tương đồng cosine (cosine similarity) khi đối chiếu với các template khuôn mặt đã được đăng ký, trực tiếp gây ra tình trạng nhận diện chậm hoặc thất bại.
