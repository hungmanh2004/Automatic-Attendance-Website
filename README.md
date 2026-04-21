# Automatic Attendance Website

Ứng dụng web điểm danh bằng khuôn mặt với 2 luồng chính:

- **Guest**: Nhân viên/khách mở trang `/guest` để quét khuôn mặt bằng camera trình duyệt (YOLO ONNX chạy trong browser) hoặc gửi ảnh đã crop.
- **Manager**: Đăng nhập tại `/manager` để quản lý nhân viên, đăng ký mẫu khuôn mặt (upload tĩnh 5 ảnh hoặc scanner goal-based batch 8-12 frames), và xem báo cáo điểm danh.

## Tính năng hiện tại

### Guest check-in
- Quét tự động bằng webcam qua YOLO ONNX chạy trực tiếp trên trình duyệt.
- YOLO ONNX `yolov12n-face` chạy trực tiếp trong trình duyệt — backend chỉ nhận ảnh đã crop + keypoints, giảm bandwidth đáng kể.
- Luồng legacy `/api/guest/checkin`: gửi full frame → backend tự detect + align + embed (vẫn còn để tương thích API).
- Rate limit: 10 request/60 giây/IP (Redis fixed-window).
- File upload validation: chỉ chấp nhận JPEG, PNG, BMP, WebP.

### Face enrollment
- **5-ảnh static**: Upload đúng 5 ảnh tĩnh để tạo bộ mẫu operational.
- **Batch (8-12 frames)**: Tự động chọn frame đẹp nhất, scoring theo blur/brightness/pose, deduplicate by cosine distance.
- Validation client-side: `no_face`, `multiple_faces`, `insufficient_frames`.
- Redis index được sync ngay sau khi enrollment thành công.

### Face recognition pipeline
- **Browser YOLOv12 face detection** (`.onnx`): bounding box + 5 facial keypoints (2 mắt, mũi, 2 miệng) cho luồng guest/scanner mới.
- **Backend YOLOv12** (`.pt`): vẫn dùng trong luồng legacy full-frame và enrollment static.
- **InsightFace BuffaloL**: trích xuất embedding 512 chiều từ ảnh đã align.
- **Face alignment**: xoay ảnh theo eye keypoints với padding 50%.
- **Redis RediSearch**: FLAT index, cosine distance, threshold 0.6.
- Mỗi nhân viên chỉ tạo **1 bản ghi điểm danh/ngày**.

### Manager dashboard & reports
- KPI: tổng nhân viên, điểm danh hôm nay, đúng giờ/đi muộn, tỷ lệ bao phủ.
- Bar chart theo số ngày làm việc mỗi nhân viên trong tháng (từ `employee_stats`).
- Nhật ký điểm danh hôm nay theo thời gian thực.
- Export CSV cho lịch sử điểm danh và tổng hợp KPI.
- Pagination cho lịch sử điểm danh (mặc định 50 bản ghi/trang).

### Backend
- **Flask 3** app factory, SQLAlchemy ORM, SQLite local.
- **Redis** cho session store, rate limiting, và RediSearch vector index.
- **Celery** xử lý async crop recognition cho `/api/guest/checkin-kpts`; frontend poll `/api/guest/checkin-kpts/tasks/<task_id>` để lấy kết quả.
- Magic numbers configurable qua `Config` (giờ điểm danh, số mẫu face, batch frame limits, similarity threshold, rate limit).
- Bare `except` blocks đã được thay bằng logging.
- Redis face-index cleanup dùng incremental scan: `delete_employee_samples()` dùng `SCAN`, còn `FaceIndexService.refresh()` dùng `scan_iter(match="face:*", count=500)` khi rebuild full index.
- `FaceIndexService` nhận `VectorStore` adapter qua constructor; production mặc định dùng `RedisVectorStore`, còn tests/dev có thể truyền fake hoặc in-memory store.

## Kiến trúc tổng quan

```
Browser (React)
  ├── GuestCheckinPage  →  useYoloDetection.js  →  /api/guest/checkin-kpts
  │                                         (crop + keypoints → backend)
  ├── ManagerLayout    →  DashboardPage         →  /api/manager/dashboard
  │                      EmployeeListPage      →  /api/manager/employees
  │                      EmployeeFaceScannerPage →  /api/manager/employees/:id/face-enrollment/batch
  │                      AttendancePage         →  /api/manager/attendance
  └── ReportsPage      →  /api/manager/dashboard + /api/manager/attendance

Backend (Flask)
  ├── bootstrap.py     → schema update helper for app startup
  ├── embedding.py      → YOLOv12 + InsightFace BuffaloL
  ├── face_alignment.py → cv2.warpAffine (eye-based rotation)
  ├── redis_vector_store.py → RediSearch FLAT index, cosine KNN
  ├── in_memory_vector_store.py → test/dev VectorStore adapter
  ├── face_index.py     → FaceIndexService (VectorStore-backed wrapper)
  ├── attendance.py     → AttendanceService (dashboard + records)
  └── face_batch_enrollment.py → quality scoring, deduplication

Redis
  └── idx:faces  →  RediSearch vector index (512-dim embeddings)

Storage
  ├── backend/data/app.db          (SQLite: employees, face_samples, face_embeddings, attendance_events)
  ├── backend/data/checkins/       (guest check-in snapshots)
  └── backend/data/faces/          (enrollment face samples)
```

## Cấu trúc thư mục

```text
.
|-- backend/
|   |-- app/
|   |   |-- __init__.py            App factory + service wiring
|   |   |-- bootstrap.py           Startup bootstrap helpers (schema updates)
|   |   |-- config.py              Config (all magic numbers here)
|   |   |-- extensions.py          SQLAlchemy db instance
|   |   |-- models.py              5 SQLAlchemy models
|   |   |-- routes/
|   |   |   |-- health.py          GET /api/health
|   |   |   |-- guest.py           POST /api/guest/checkin, /api/guest/checkin-kpts
|   |   |   |-- manager.py         CRUD employees, attendance, dashboard
|   |   |   `-- face_enrollment.py  5-ảnh + batch face enrollment
|   |   `-- services/
|   |       |-- auth.py            Session-based manager auth
|   |       |-- storage.py         File I/O for snapshots & face samples
|   |       |-- embedding.py        YOLO + InsightFace pipeline
|   |       |-- face_alignment.py   cv2 eye-based face alignment
|   |       |-- face_batch_enrollment.py  Batch scoring & selection
|   |       |-- face_index.py       FaceIndexService (VectorStore-backed wrapper)
|   |       |-- redis_vector_store.py  RediSearch vector store
|   |       |-- in_memory_vector_store.py  Test/dev VectorStore adapter
|   |       |-- vector_store.py    Abstract VectorStore interface
|   |       |-- recognition.py      Guest recognition orchestrator
|   |       |-- attendance.py       Attendance records & dashboard
|   |       |-- redis_client.py     Redis connection singleton
|   |       `-- rate_limiter.py     Redis fixed-window rate limiter
|   |-- tests/                     pytest test suite
|   |-- data/                      SQLite DB + uploaded files (gitignored)
|   |-- Dockerfile
|   |-- requirements.txt
|   `-- run.py
|-- frontend/
|   |-- src/
|   |   |-- App.jsx                React Router routes
|   |   |-- pages/
|   |   |   |-- GuestCheckinPage.jsx     Guest kiosk
|   |   |   |-- ManagerLoginPage.jsx      Manager login
|   |   |   |-- DashboardPage.jsx         KPI overview
|   |   |   |-- EmployeeListPage.jsx      Employee CRUD
|   |   |   |-- EmployeeFacesPage.jsx    5-ảnh face gallery
|   |   |   |-- EmployeeFaceScannerPage.jsx  Guided camera enrollment
|   |   |   |-- AttendancePage.jsx       Attendance log + CSV export
|   |   |   `-- ReportsPage.jsx          KPI reports + CSV export
|   |   |-- components/
|   |   |   |-- ManagerLayout.jsx       Sidebar + nav wrapper
|   |   |   `-- ProtectedRoute.jsx       Auth guard
|   |   |-- context/
|   |   |   `-- ManagerAuthContext.jsx  Auth state provider
|   |   |-- hooks/
|   |   |   |-- useGuestCamera.js        Camera access
|   |   |   |-- useYoloDetection.js      Browser YOLO ONNX inference
|   |   |   `-- useFaceRegistration.js   Guided enrollment scanner
|   |   `-- lib/
|   |       |-- api.js                 Core API layer (all manager endpoints)
|   |       |-- attendanceApi.js        Attendance query + pagination
|   |       |-- guestApi.js            Guest check-in helpers
|   |       |-- faceApiService.js      Batch face enrollment (re-export)
|   |       |-- cameraService.js       Browser FaceDetector utilities
|   |       |-- yoloOnnxService.js     YOLOv12 ONNX inference engine
|   |       `-- errorMessages.js       Error → human-readable string
|   `-- vite.config.js
|-- scripts/
|   |-- create_manager.py
|   |-- migrate_redis_vector.py
|   `-- dev/
|       `-- build_db_benchmark.py
|-- docs/
|   |-- Improvement Plan/
|   |-- Project Codebase/
|   `-- superpowers/
|-- docker-compose.yml
|-- run-local.ps1
`-- .env.example
```

### Backend bootstrap
- `backend/app/__init__.py` owns the Flask app factory orchestration: resolve paths, configure storage, initialize Redis/session/database, wire services, and register blueprints.
- `backend/app/bootstrap.py` owns startup schema patches such as adding/backfilling legacy `employees.department` and `employees.position` columns.
- `EmbeddingService.prewarm()` is the public startup hook for loading InsightFace early; app factory code should call this method instead of private lazy-load helpers.
- `FACE_MATCH_THRESHOLD` is read from `Config` and passed into `FaceIndexService` during service construction, so recognition threshold changes should be made in config/env rather than inside the service.
- `FaceIndexService` depends on the abstract `VectorStore` port by constructor injection; production falls back to `RedisVectorStore`, while tests/dev can pass `InMemoryVectorStore` or another fake adapter without touching Redis.
- New startup migration or bootstrap helpers should go into `bootstrap.py`; keep `create_app()` focused on orchestration and dependency wiring.

## Biến môi trường

### Backend `.env`

```env
SECRET_KEY=change-me-to-a-random-string
REDIS_URL=redis://localhost:6379
CELERY_BROKER_URL=redis://localhost:6379
CELERY_RESULT_BACKEND=redis://localhost:6379
FACE_BATCH_MIN_FRAMES=8
FACE_BATCH_MAX_FRAMES=12
FACE_CAPTURE_MIN_GAP_MS=300
```

### Frontend `.env` (nếu không dùng Docker)

```env
FRONTEND_API_TARGET=http://127.0.0.1:5000
FRONTEND_HOST=127.0.0.1
FRONTEND_PORT=5173
```

## Chạy bằng Docker Compose

### Yêu cầu
- Docker Desktop
- Docker Compose

### Khởi động

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Sau khi chạy:
- **Frontend**: `http://localhost:8080`
- **Guest check-in**: `http://localhost:8080/guest`
- **Manager login**: `http://localhost:8080/manager/login`
- **Backend health**: `http://localhost:5000/api/health`

Lần chạy đầu tiên có thể chậm do cài dependency và tải YOLO/InsightFace model.

### Async Guest Check-In Worker

The `/api/guest/checkin-kpts` endpoint enqueues crop recognition work in Celery and returns a task id. The frontend polls `/api/guest/checkin-kpts/tasks/<task_id>` until the task completes.

Run the Flask API and worker together with Docker Compose:

```powershell
docker compose up --build backend celery_worker redis
```

Local environment variables:

```text
CELERY_BROKER_URL=redis://localhost:6379
CELERY_RESULT_BACKEND=redis://localhost:6379
FACE_BATCH_MIN_FRAMES=8
FACE_BATCH_MAX_FRAMES=12
FACE_CAPTURE_MIN_GAP_MS=300
```

### Khi nào cần rebuild

```powershell
docker compose up --build
```

Dùng khi thay đổi:
- `backend/requirements.txt`
- `frontend/package.json`
- `Dockerfile`

Với thay đổi source code thông thường, chỉ cần:
```powershell
docker compose up          # restart containers
# hoặc
docker compose restart backend
```
Nếu sửa frontend thì còn phải
```
cd frontend
npm run build
```

### Tạo tài khoản manager

```powershell
docker compose exec backend python scripts/create_manager.py --username admin --password abc123
```

Script sẽ in `exists:<username>` nếu tài khoản đã tồn tại.

Các script backend import qua package chuẩn `backend.app...`, vì vậy nên chạy từ repo root hoặc trong container backend có repo root trên `PYTHONPATH`:

```powershell
python scripts/create_manager.py --username admin --password abc123
python scripts/migrate_redis_vector.py
```

`scripts/dev/build_db_benchmark.py` là utility benchmark dataset, không phải runtime dependency.

## Chạy local không dùng Docker

### Backend

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
Copy-Item .env.example .env
# Cần Redis đang chạy: redis-server
python backend/run.py
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Vite proxy: `/api/*` → `http://127.0.0.1:5000` (dev).

### Script Windows

```powershell
.\run-local.ps1   # mở backend và frontend trong 2 cửa sổ PowerShell
```

## Kiểm thử

### Backend

```powershell
python -m pytest backend/tests -v
```

### Frontend

```powershell
cd frontend
npm test
```

## API Endpoints

### Guest (không cần auth)

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| POST | `/api/guest/checkin` | `FormData(frame: JPEG)` | `status: recognized \| unknown \| already_checked_in \| no_face \| multiple_faces \| rate_limited` |
| POST | `/api/guest/checkin-kpts` | `FormData(crop: JPEG, kpts: JSON)` | Tương tự checkin |

### Manager (session cookie required)

| Method | Endpoint | Body/Params | Response |
|--------|----------|-------------|----------|
| POST | `/api/manager/login` | `{username, password}` | `{manager}` |
| POST | `/api/manager/logout` | — | `{}` |
| GET | `/api/manager/me` | — | `{manager}` |
| GET | `/api/manager/dashboard` | — | `{summary, daily_log, employee_stats}` |
| GET | `/api/manager/employees` | — | `{employees}` |
| POST | `/api/manager/employees` | `{employee_code, full_name, department?, position?}` | `{employee}` |
| PUT | `/api/manager/employees/:id` | `{...fields}` | `{employee}` |
| DELETE | `/api/manager/employees/:id` | — | hard-delete employee + xóa face data + xóa attendance events |
| GET | `/api/manager/employees/:id/face-samples` | — | `{employee, face_samples}` |
| POST | `/api/manager/employees/:id/face-enrollment` | `FormData(images×5)` | `{employee, face_samples}` |
| POST | `/api/manager/employees/:id/face-enrollment/batch` | `FormData(frames×N, metadata)` | `{status, face_samples, saved_embedding_count}` |
| PUT | `/api/manager/employees/:id/face-samples/:idx` | `FormData(image)` | `{employee, face_sample}` |
| DELETE | `/api/manager/employees/:id/face-samples` | — | `{employee_id, deleted_count}` |
| GET | `/api/manager/attendance` | `?from=&to=&search=&department=&position=&page=&per_page=` | `{filters, pagination, records}` |
| GET | `/api/manager/attendance/:id/snapshot` | — | Ảnh JPEG snapshot |

### Pagination

`GET /api/manager/attendance` trả về:

```json
{
  "filters": { "from": "2026-04-16", "to": "2026-04-16", "search": "", "department": "", "position": "" },
  "pagination": { "page": 1, "per_page": 50, "total": 123, "pages": 3 },
  "records": [
    {
      "id": 1,
      "employee_code": "EMP-001",
      "full_name": "Nguyễn Văn A",
      "department": "Văn phòng",
      "position": "Nhân viên",
      "checked_in_at": "2026-04-16T08:45:00",
      "status": "On-time",
      "distance": 0.12,
      "snapshot_url": "/api/manager/attendance/1/snapshot"
    }
  ]
}
```

## Giới hạn hiện tại

- Mỗi nhân viên chỉ có 1 bản ghi điểm danh/ngày (unique constraint `(employee_id, checkin_date)`).
- Face index refresh đồng bộ sau enrollment — nếu Redis lỗi sau DB commit có thể không sync.
- YOLO ONNX model (25 MB) load lần đầu trên browser có thể chậm; backend đã pre-warm InsightFace khi app startup.
- Không có notification/push cho điểm danh thời gian thực qua WebSocket.
- Chưa có ghi log/audit trail cho thao tác manager.
- `failed_checkins` và `failed_scans_today` trong dashboard summary luôn = 0 (stub).
