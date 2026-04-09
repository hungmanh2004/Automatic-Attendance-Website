# Automatic Attendance Website

Ung dung web cham cong bang khuon mat voi 2 luong su dung chinh:

- Guest/nhan vien mo trang guest de quet khuon mat bang camera trinh duyet hoac tai anh len.
- Manager dang nhap vao trang quan tri de quan ly nhan vien, quan ly bo 5 anh khuon mat va xem lich su cham cong.

README nay da duoc cap nhat theo kien truc hien tai cua repo web.

## Tinh nang hien tai

- Guest check-in bang webcam trong trinh duyet, co fallback upload anh.
- Rate limit cho endpoint guest check-in: 10 request trong 60 giay theo IP.
- Dang nhap manager bang session cookie Flask.
- Tao, sua va xoa mem nhan vien.
- Dang ky bo 5 anh khuon mat cho nhan vien.
- Thay the rieng tung anh trong 5 slot khuon mat neu co anh bi nham.
- Kiem tra loi `no_face` / `multiple_faces` trong qua trinh dang ky hoac thay anh.
- Nhan dien khuon mat bang DeepFace voi model ArcFace.
- So khop embedding bang cosine distance voi nguong mac dinh `0.6`.
- Moi nhan vien chi co 1 ban ghi cham cong moi ngay.
- Luu snapshot check-in de manager xem lai tu trang attendance.
- Loc lich su diem danh theo ngay, ma nhan vien / ho ten, phong ban va chuc vu.

## Kien truc tong quan

### Frontend

- React 18
- Vite
- React Router
- Vitest + Testing Library

### Backend

- Flask 3
- Flask-SQLAlchemy
- SQLite local: `backend/data/app.db`
- DeepFace / ArcFace
- OpenCV + NumPy

### Luu tru local

- Database: `backend/data/app.db`
- Anh check-in: `backend/data/checkins/<YYYY-MM-DD>/...`
- Anh mau khuon mat: `backend/data/faces/employee-<id>/...`

## Luong nghiep vu

1. Tao tai khoan manager.
2. Dang nhap `/manager/login`.
3. Tao nhan vien moi voi `employee_code`, `full_name`, `department`, `position`.
4. Tai len dung 5 anh khuon mat cho tung nhan vien.
5. Neu 1 trong 5 anh bi sai, manager vao trang khuon mat va thay dung slot do.
6. Guest mo `/guest` de quet khuon mat bang camera hoac gui anh.
7. He thong trich xuat embedding, so khop voi bo mau dang hoat dong va ghi nhan check-in neu hop le.
8. Manager vao trang attendance de xem danh sach ban ghi va snapshot.

## Cau truc thu muc

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

## Bien moi truong

Copy `.env.example` thanh `.env`:

```powershell
Copy-Item .env.example .env
```

Noi dung hien tai:

```env
SECRET_KEY=change-me-to-a-random-string
```

`SECRET_KEY` nen duoc dat co dinh trong dev/production de session manager khong bi mat sau moi lan restart.

## Chay bang Docker Compose

`docker-compose.yml` hien duoc cau hinh theo huong production-ready:

- Frontend build bang Vite va serve bang Nginx.
- Nginx proxy `/api` sang backend de frontend va backend cung origin.
- Backend chay bang Gunicorn thay vi Flask dev server.

### Yeu cau

- Docker Desktop
- Docker Compose

### Khoi dong

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Sau khi chay:

- Frontend: `http://localhost:8080`
- Guest check-in: `http://localhost:8080/guest`
- Manager login: `http://localhost:8080/manager/login`
- Backend health: `http://localhost:5000/api/health`

### Tao tai khoan manager

Trong mot terminal khac:

```powershell
docker compose exec backend python scripts/create_manager.py --username admin --password abc123
```

Neu tai khoan da ton tai, script se in ra `exists:<username>`.

## Chay local khong dung Docker

Frontend local mac dinh proxy `/api` sang `http://127.0.0.1:5000`. Khi chay trong Docker Compose, bien moi truong se doi target sang `http://backend:5000`.

Vite da duoc cau hinh `strictPort` cho cong `5173` de tranh mo nham frontend cu o cong khac.

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

### Script ho tro tren Windows

Repo co san `run-local.ps1` de mo backend va frontend trong 2 cua so PowerShell rieng:

```powershell
.\run-local.ps1
```

## Kiem thu

### Backend

```powershell
python -m pytest backend/tests -v
```

### Frontend

```powershell
Set-Location frontend
npm test
```

## API va hanh vi quan trong

- `POST /api/guest/checkin`
  - Nhan file `frame`
  - Tra ve cac trang thai nhu `recognized`, `already_checked_in`, `unknown`, `no_face`, `multiple_faces`, `rate_limited`
- `POST /api/manager/login`
  - Dang nhap manager
- `GET /api/manager/me`
  - Lay manager hien tai tu session
- `GET /api/manager/employees`
  - Lay danh sach nhan vien
- `POST /api/manager/employees`
  - Tao nhan vien moi voi `employee_code`, `full_name`, `department`, `position`
- `PUT /api/manager/employees/<id>`
  - Cap nhat thong tin nhan vien, bao gom `department` va `position`
- `DELETE /api/manager/employees/<id>`
  - Xoa mem nhan vien: dat `is_active = false` va xoa bo khuon mat khoi recognition index
- `GET /api/manager/employees/<id>/face-samples`
  - Lay danh sach mau khuon mat da dang ky
- `GET /api/manager/employees/<id>/face-samples/<sample_index>/image`
  - Tra ve file anh cua dung slot khuon mat de frontend preview
- `POST /api/manager/employees/<id>/face-enrollment`
  - Dang ky dung 5 anh khuon mat
- `PUT /api/manager/employees/<id>/face-samples/<sample_index>`
  - Thay the rieng 1 anh khuon mat trong 5 slot va refresh face index ngay sau khi luu
- `DELETE /api/manager/employees/<id>/face-samples`
  - Xoa toan bo bo mau da dang ky
- `GET /api/manager/dashboard`
  - Lay tong quan KPI va thong ke nhan vien
- `GET /api/manager/attendance`
  - Xem lich su diem danh theo bo loc ngay / tim kiem / phong ban / chuc vu

## Ghi chu hanh vi

- Xoa nhan vien hien duoc trien khai theo kieu xoa mem de giu lich su cham cong.
- Khi xoa mem nhan vien, bo khuon mat se bi xoa khoi recognition index de khong con nhan dien nham.
- Trang quan ly khuon mat hien cho phep sua rieng tung slot de khong phai dang ky lai ca bo 5 anh.

## Gioi han hien tai

- Du an hien uu tien luu tru local bang SQLite va file he thong, chua co dong bo cloud/database ngoai.
- Frontend local dev can de y cau hinh proxy `/api` neu khong chay qua Docker.
