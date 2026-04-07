# Automatic Attendance Website

Ứng dụng web điểm danh bằng khuôn mặt với 2 luồng sử dụng chính:

- Nhân viên/khách mở trang guest để quét khuôn mặt bằng camera trình duyệt hoặc tải ảnh lên.
- Quản lý đăng nhập vào trang manager để tạo nhân viên, đăng ký mẫu khuôn mặt và xem nhật ký điểm danh.

README này đã được cập nhật theo kiến trúc hiện tại của repo. Đây không còn là ứng dụng desktop Python cũ nữa.

## Tính năng hiện tại

- Guest check-in bằng webcam trong trình duyệt, tự động quét định kỳ và có fallback tải ảnh khi camera không dùng được.
- Rate limit cho endpoint guest check-in: 10 request trong 60 giây theo IP.
- Đăng nhập manager bằng session cookie của Flask.
- Tạo và xem danh sách nhân viên.
- Đăng ký khuôn mặt cho nhân viên bằng đúng 5 ảnh mẫu.
- Kiểm tra lỗi no face / multiple faces ngay trong quá trình đăng ký.
- Nhận diện khuôn mặt bằng DeepFace với model ArcFace.
- So khớp embedding bằng cosine distance với ngưỡng mặc định `0.6`.
- Chỉ tạo 1 bản ghi điểm danh mỗi nhân viên trong mỗi ngày.
- Lưu snapshot check-in để manager mở lại từ trang attendance.
- Lọc lịch sử điểm danh theo ngày và tìm theo mã nhân viên / họ tên.

## Kiến trúc tổng quan

### Frontend

- React 18
- Vite
- React Router
- Vitest + Testing Library

### Backend

- Flask 3
- Flask-SQLAlchemy
- SQLite local (`backend/data/app.db`)
- DeepFace / ArcFace
- OpenCV + NumPy

### Lưu trữ local

- Database: `backend/data/app.db`
- Ảnh check-in: `backend/data/checkins/<YYYY-MM-DD>/...`
- Ảnh mẫu khuôn mặt: `backend/data/faces/employee-<id>/...`

## Luồng nghiệp vụ

1. Tạo tài khoản manager.
2. Đăng nhập trang `/manager/login`.
3. Tạo nhân viên mới với `employee_code` và `full_name`.
4. Tải lên đúng 5 ảnh khuôn mặt cho từng nhân viên.
5. Mở trang `/guest` để quét khuôn mặt bằng camera hoặc gửi ảnh thủ công.
6. Hệ thống trích xuất embedding, so khớp với bộ mẫu đang hoạt động và ghi nhận check-in nếu hợp lệ.
7. Manager vào trang attendance để xem danh sách bản ghi và snapshot.

## Cấu trúc thư mục

```text
.
|-- backend/
|   |-- app/
|   |   |-- routes/
|   |   |-- services/
|   |   |-- models.py
|   |   `-- config.py
|   |-- tests/
|   |-- Dockerfile
|   `-- run.py
|-- frontend/
|   |-- src/
|   |   |-- pages/
|   |   |-- components/
|   |   |-- context/
|   |   `-- lib/
|   |-- package.json
|   `-- vite.config.js
|-- scripts/
|   `-- create_manager.py
|-- docker-compose.yml
|-- run-local.ps1
`-- .env.example
```

## Biến môi trường

Copy `.env.example` thành `.env`:

```powershell
Copy-Item .env.example .env
```

Nội dung hiện tại:

```env
SECRET_KEY=change-me-to-a-random-string
```

`SECRET_KEY` nên được đặt cố định trong môi trường dev/production để session manager không bị mất sau mỗi lần restart.

## Chạy bằng Docker Compose

`docker-compose.yml` hiện được cấu hình theo hướng production-ready:
- Frontend được build bằng Vite và serve bằng Nginx.
- Nginx proxy `/api` sang backend để frontend và backend cùng origin.
- Backend chạy bằng Gunicorn thay vì Flask dev server.

### Yêu cầu

- Docker Desktop
- Docker Compose

### Khởi động

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Sau khi chạy:

- Frontend: `http://localhost:8080`
- Guest check-in: `http://localhost:8080/guest`
- Manager login: `http://localhost:8080/manager/login`
- Backend health: `http://localhost:5000/api/health`

Lần chạy đầu có thể chậm hơn do container cần cài dependency và tải model/cache phục vụ nhận diện.

### Tạo tài khoản manager

Trong một terminal khác:

```powershell
docker compose exec backend python scripts/create_manager.py --username admin --password abc123
```

Nếu tài khoản đã tồn tại, script sẽ in ra `exists:<username>`.

## Chạy local không dùng Docker

Phù hợp khi bạn muốn debug riêng từng service. Frontend local mặc định proxy `/api` sang `http://127.0.0.1:5000`. Khi chạy trong Docker Compose, biến môi trường sẽ đổi target sang `http://backend:5000`.

Vite đã được cấu hình `strictPort` cho cổng `5173`. Nếu cổng này đang bị một frontend cũ chiếm dụng, `npm run dev` sẽ báo lỗi thay vì âm thầm nhảy sang `5174`, giúp tránh mở nhầm giao diện cũ.

### Backend

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
Copy-Item .env.example .env
python backend/run.py
```

### Frontend

```powershell
Set-Location frontend
npm install
npm run dev
```

### Script hỗ trợ trên Windows

Repo có sẵn `run-local.ps1` để mở backend và frontend trong 2 cửa sổ PowerShell riêng:

```powershell
.\run-local.ps1
```

## Kiểm thử

### Backend

```powershell
python -m pytest backend/tests -v
```

### Frontend

```powershell
Set-Location frontend
npm test
```

## API và hành vi quan trọng

- `POST /api/guest/checkin`
  - Nhận file `frame`
  - Trả về các trạng thái như `recognized`, `already_checked_in`, `unknown`, `no_face`, `multiple_faces`, `rate_limited`
- `POST /api/manager/login`
  - Đăng nhập manager
- `GET /api/manager/employees`
  - Lấy danh sách nhân viên
- `POST /api/manager/employees`
  - Tạo nhân viên mới
- `GET /api/manager/employees/<id>/face-samples`
  - Lấy danh sách mẫu khuôn mặt đã đăng ký
- `POST /api/manager/employees/<id>/face-enrollment`
  - Đăng ký đúng 5 ảnh khuôn mặt
- `DELETE /api/manager/employees/<id>/face-samples`
  - Xóa toàn bộ bộ mẫu đã đăng ký
- `GET /api/manager/attendance`
  - Xem lịch sử điểm danh theo bộ lọc ngày / tìm kiếm

## Giới hạn hiện tại

- Mỗi nhân viên hiện chỉ có luồng tạo/xem và đăng ký/xóa bộ mẫu khuôn mặt; chưa có sửa/xóa nhân viên trên giao diện.
- Face index được refresh từ dữ liệu lưu trữ trong quá trình so khớp.
- Dự án hiện ưu tiên lưu trữ local bằng SQLite và file hệ thống, chưa có đồng bộ cloud/database ngoài.
- Frontend local dev cần để ý cấu hình proxy `/api` nếu không chạy qua Docker.

