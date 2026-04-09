# Worklog Since Clone

Tai lieu nay ghi lai cac thay doi frontend/backend da duoc thuc hien tu luc clone repo den thoi diem hien tai, trong do frontend da duoc thay moi lai theo mot brief Guardian AI hoan toan moi.

## Prompt thiet ke duoc ap dung

```text
🚀 PROMPT THIẾT KẾ HỆ THỐNG CHẤM CÔNG AI (PHIÊN BẢN NÂNG CẤP)
🧠 Tổng thể hệ thống

Thiết kế một hệ thống dashboard chấm công bằng AI (nhận diện khuôn mặt) mang phong cách Guardian AI hiện đại, cao cấp, mang hơi hướng công nghệ tương lai.

Phong cách: Glassmorphism + Gradient (xanh dương → trắng → tím nhạt)
Bố cục: Bento Grid (chia khối rõ ràng)
UI: bo góc lớn (24–32px), bóng đổ mềm, spacing rộng
UX: mượt mà, realtime, phản hồi trực quan
Cảm giác: bảo mật cao, AI thông minh, enterprise-grade
🔷 1. TRANG HOME (KIOSK ĐIỂM DANH – REALTIME AI)
📸 Khu vực camera (Trung tâm)
Khung camera lớn chiếm ~65% màn hình
Tỷ lệ 16:9, bo góc 32px
Overlay công nghệ:
Khung nhận diện khuôn mặt (bounding box)
Viền góc cyan phát sáng
Đường quét laser chạy ngang
Hiển thị trạng thái AI:
🟢 “ĐANG QUÉT” (Scanning Active)
🟡 “TẠM DỪNG” (Paused)
🔴 “LỖI CAMERA” (Camera Error)
🔘 Nút điều khiển thông minh (QUAN TRỌNG NHẤT)

Đặt dưới camera:

👉 Trạng thái 1: ĐANG QUÉT
Nút lớn, màu đỏ nổi bật
Text: "DỪNG QUÉT"
Icon: ⏸ Pause
Hiệu ứng glow nhẹ
👉 Khi bấm:
Camera dừng scanning
Overlay chuyển sang “Paused”
Freeze frame hoặc làm mờ nhẹ
👉 Trạng thái 2: ĐÃ DỪNG
Nút chuyển sang màu xanh
Text: "BẮT ĐẦU QUÉT"
Icon: ▶ Play
👉 Khi bấm:
Resume scanning
AI tiếp tục nhận diện
Nút quay lại trạng thái đỏ
📊 Panel bên phải (AI Result + History)
🧑 Người vừa quét
Avatar lớn (hình tròn)
Tên: in đậm
Chức vụ
Thời gian check-in
Badge:
🟢 “Trùng khớp 99.8%”
🔴 “Không nhận diện”
Thanh confidence dạng vòng tròn (circular progress)
📜 Lịch sử gần nhất (Recent Logs)
Danh sách 5–10 người gần nhất
Hiển thị:
Avatar nhỏ
Tên
Thời gian
Status màu:
Xanh: Thành công
Đỏ: Lỗi
Cam: Không rõ
⚡ Hành vi hệ thống
Khi đang quét:
Realtime update
Khi dừng:
Không nhận diện mới
Cho phép xem lịch sử
Animation mượt giữa Start ↔ Stop
🔷 2. TRANG ADMIN DASHBOARD (QUẢN TRỊ TOÀN HỆ THỐNG)
📂 Sidebar (bên trái)
Tổng quan (Dashboard)
Quản lý nhân viên
Quản lý chấm công
Báo cáo

Style:

Trong suốt nhẹ (glass)
Hover highlight
Icon line hiện đại
📊 KHU VỰC 1: TỔNG QUAN (DASHBOARD)
KPI cards (4 thẻ)
Tổng lượt chấm hôm nay
Số người đúng giờ
Số người đi muộn
Lỗi / Không chấm

👉 Thiết kế:

Card bo góc
Icon + số lớn
% thay đổi so với hôm qua
📈 Biểu đồ tháng
Bar chart (chấm công theo ngày)
Line trend (xu hướng)
Tooltip hover
👥 KHU VỰC 2: QUẢN LÝ NHÂN VIÊN
Table nâng cao

Cột gồm:

Avatar + Tên
Chức vụ
Thống kê tháng:
Tổng ngày làm
Đúng giờ
Đi muộn
Vắng
Thanh progress thể hiện hiệu suất
Trạng thái:
🟢 Tốt
🟡 Cảnh báo
🔴 Vấn đề

👉 Có:

Search
Filter theo phòng ban
Sort
🗂️ KHU VỰC 3: QUẢN LÝ CHẤM CÔNG
📅 Bộ lọc thời gian (Quan trọng)

Toggle:

Theo ngày (Daily)
Theo tuần (Weekly)
Theo tháng (Monthly)
📋 Bảng lịch sử

Hiển thị:

Tên nhân viên
Thời gian
Trạng thái
Confidence (%)
Địa điểm (ví dụ: Cửa chính)
Nút xem ảnh camera
📤 Chức năng nâng cao
Nút "Tải báo cáo" (Export)
Xuất Excel / CSV
Lọc theo:
Nhân viên
Trạng thái
Khoảng thời gian
🎨 UI / UX NÂNG CAO
Motion:
Fade + slide nhẹ
Hover:
Glow subtle
Font:
Sans-serif hiện đại (Inter / SF Pro)
Shadow:
Soft layered shadow
Card:
Depth rõ (glass effect)
⚙️ TÍNH NĂNG AI (OPTIONAL – NÂNG CAO)
Cảnh báo nếu scan fail nhiều lần
Highlight người lạ
Log AI confidence thấp
Notification realtime
```

## Quy uoc hien tai

- Frontend production qua Docker: `http://localhost:8080`
- Backend API: `http://localhost:5000`
- Frontend local dev: `http://127.0.0.1:5173`

## Thay doi lon nhat da thuc hien

### 1. Loai bo giao dien frontend cu

- Khong con dung landing page cu lam home chinh.
- Route `/` da duoc doi thanh kiosk AI realtime.
- Giao dien manager cu da duoc thay bang mot visual system Guardian AI moi.

### 2. Dung lai visual system toan cuc

File lien quan:

- `frontend/src/styles.css`

Noi dung:

- Tao design system moi theo huong glassmorphism + gradient xanh/cyan/tim.
- Thay token mau, radius, shadow, spacing.
- Tao lai button, glass panel, badge, table, progress bar, sidebar manager.
- Thay font sang style hien dai phu hop brief.

### 3. Dung lai trang home kiosk AI

File lien quan:

- `frontend/src/App.jsx`
- `frontend/src/pages/GuestCheckinPage.jsx`
- `frontend/src/pages/GuestCheckinPage.css`

Noi dung:

- Route `/` va `/guest` cung tro vao kiosk AI.
- Kiosk moi gom:
  - camera stage lon o trung tam
  - face bounding box
  - laser scan line
  - overlay scanning / paused / camera error
  - nut `Dung quet` / `Bat dau quet`
  - panel ben phai cho ket qua AI
  - confidence ring
  - recent logs
  - fallback upload khi camera loi
- Luong scanning cu van duoc giu tren API hien co:
  - auto scan theo interval
  - pause / resume
  - history realtime

### 4. Dung lai admin shell

File lien quan:

- `frontend/src/components/ManagerLayout.jsx`
- `frontend/src/components/ProtectedRoute.jsx`
- `frontend/src/pages/ManagerLoginPage.jsx`

Noi dung:

- Sidebar moi theo glass panel.
- Menu moi:
  - Tong quan
  - Nhan vien
  - Cham cong
  - Bao cao
- Dang nhap manager duoc restyle theo Guardian AI.
- Protected route loading state duoc restyle dong bo.

### 5. Dung lai dashboard tong quan

File lien quan:

- `frontend/src/pages/DashboardPage.jsx`
- `frontend/src/pages/DashboardPage.css`

Noi dung:

- Tao dashboard moi theo Bento Grid:
  - 4 KPI cards
  - chart theo ngay trong tuan
  - khu AI signals
  - realtime recognition feed
- Dashboard van dung du lieu tu endpoint:
  - `GET /api/manager/dashboard`

### 6. Dung lai man quan ly nhan vien

File lien quan:

- `frontend/src/pages/EmployeeListPage.jsx`
- `frontend/src/pages/EmployeeFacesPage.jsx`

Noi dung:

- Employee list moi:
  - search
  - filter phong ban
  - bang thong ke hieu suat
  - progress bar
  - trang thai Tot / Canh bao / Van de
- Face enrollment moi:
  - grid 5 slots
  - upload kit
  - xoa bo khuon mat
- Employee list hien gop du lieu tu:
  - `GET /api/manager/employees`
  - `GET /api/manager/dashboard`

### 7. Dung lai man quan ly cham cong

File lien quan:

- `frontend/src/pages/AttendancePage.jsx`
- `frontend/src/pages/AttendancePage.css`

Noi dung:

- Them toggle:
  - Daily
  - Weekly
  - Monthly
- Them filter:
  - from
  - to
  - nhan vien
  - trang thai
- Bang lich su moi hien:
  - nhan vien
  - thoi gian
  - trang thai
  - confidence
  - dia diem
  - link snapshot
- Them export CSV ngay tren man hinh.

### 8. Them khu bao cao moi

File lien quan:

- `frontend/src/pages/ReportsPage.jsx`

Noi dung:

- Them route moi `/manager/reports`
- Them khu export:
  - full attendance CSV
  - KPI summary CSV
- Them AI notes card cho van hanh

## Thay doi ve deploy va luong run

### File lien quan

- `frontend/vite.config.js`
- `run-local.ps1`
- `frontend/Dockerfile`
- `frontend/nginx.conf`
- `backend/Dockerfile`
- `backend/requirements.txt`
- `docker-compose.yml`
- `.dockerignore`

### Noi dung

- Tach local run va Docker deploy.
- Frontend Docker build bang Vite va serve bang Nginx.
- Backend chay bang Gunicorn.
- Docker Compose expose:
  - frontend `8080`
  - backend `5000`
- Vite local dung `strictPort` va proxy API duoc cau hinh theo env.

## Dieu chinh backend ho tro frontend moi

### File lien quan

- `backend/app/routes/manager.py`
- `backend/app/models.py`
- `backend/app/__init__.py`
- `backend/app/services/auth.py`
- `backend/app/services/attendance.py`
- `frontend/src/lib/api.js`
- `frontend/src/pages/EmployeeListPage.jsx`

### Noi dung

- Attendance API bo sung field `distance` trong records de frontend tinh confidence phan tram.
- Da them truong `position` cho nhan vien xuyen suot frontend/backend.
- Backend model `Employee` co them cot `position`.
- Backend tu thuc hien schema update nhe neu database cu chua co cot `position`.
- Da sua schema update `position` theo huong an toan hon de tranh backend crash voi loi `duplicate column name: position` khi container khoi dong lai.
- API tao nhan vien nhan them `position`.
- Frontend form tao nhan vien co them o nhap `Chuc vu`.
- Danh sach nhan vien va dashboard employee stats su dung `position` that thay vi gia lap text co dinh.

## Kiem tra da thuc hien

- `npm.cmd run build`: pass sau khi redesign frontend Guardian AI
- `python py_compile`: da pass cho backend da sua
- `docker compose config`: pass
- Health backend: `http://127.0.0.1:5000/api/health` tra ve `{"status":"ok"}`

## Tai khoan manager hien tai

- Username: `admin`
- Password: `abc123`

Tai khoan nay da duoc tao trong backend container dang chay.

## File frontend/backed dang thay doi hien tai

- `README.md`
- `backend/Dockerfile`
- `backend/app/routes/manager.py`
- `backend/app/services/attendance.py`
- `backend/requirements.txt`
- `docker-compose.yml`
- `frontend/Dockerfile`
- `frontend/package-lock.json`
- `frontend/package.json`
- `frontend/src/App.jsx`
- `frontend/src/components/ManagerLayout.jsx`
- `frontend/src/components/ProtectedRoute.jsx`
- `frontend/src/lib/api.js`
- `frontend/src/pages/AttendancePage.css`
- `frontend/src/pages/AttendancePage.jsx`
- `frontend/src/pages/DashboardPage.css`
- `frontend/src/pages/DashboardPage.jsx`
- `frontend/src/pages/EmployeeFacesPage.jsx`
- `frontend/src/pages/EmployeeListPage.jsx`
- `frontend/src/pages/GuestCheckinPage.css`
- `frontend/src/pages/GuestCheckinPage.jsx`
- `frontend/src/pages/ManagerLoginPage.jsx`
- `frontend/src/pages/ReportsPage.jsx`
- `frontend/src/styles.css`
- `frontend/vite.config.js`
- `run-local.ps1`
- `.dockerignore`
- `frontend/nginx.conf`

## Ghi chu

- Frontend cu da duoc thay the ve mat cau truc va giao dien.
- Home hien tai la kiosk AI, khong con la landing card cu.
- Khu manager da duoc lam moi theo prompt Guardian AI.
- Quy uoc lam viec hien tai:
  - Moi thay doi code ve sau deu phai duoc ghi them vao file `WORKLOG_SINCE_CLONE.md`.

## Cap nhat CRUD nhan vien va sua tung anh khuon mat

### File lien quan

- `backend/app/routes/helpers.py`
- `backend/app/routes/manager.py`
- `backend/app/routes/face_enrollment.py`
- `backend/tests/test_manager_api.py`
- `backend/tests/test_manager_face_enrollment_api.py`
- `frontend/src/lib/api.js`
- `frontend/src/lib/errorMessages.js`
- `frontend/src/pages/EmployeeListPage.jsx`
- `frontend/src/pages/EmployeeFacesPage.jsx`
- `frontend/src/pages/EmployeeListPage.test.jsx`
- `frontend/src/pages/EmployeeFacesPage.test.jsx`
- `frontend/src/styles.css`
- `README.md`

### Noi dung

- Them API `PUT /api/manager/employees/<id>` de sua thong tin nhan vien.
- Them API `DELETE /api/manager/employees/<id>` theo huong xoa mem:
  - dat `is_active = false`
  - xoa bo face samples dang co
  - refresh face index de nhan vien bi xoa khong con duoc nhan dien
- Them API `GET /api/manager/employees/<id>/face-samples/<sample_index>/image` de frontend preview dung anh trong tung slot.
- Them API `PUT /api/manager/employees/<id>/face-samples/<sample_index>` de thay rieng 1 anh trong bo 5 anh khuon mat.
- Frontend trang nhan vien hien co:
  - sua inline trong bang
  - xoa nhan vien ngay tren bang
  - an nhan vien da bi xoa mem khoi danh sach thao tac chinh
- Frontend trang khuon mat hien co:
  - thumbnail tung slot
  - nut thay rieng moi slot
  - van giu luong dang ky moi du 5 anh va xoa ca bo khi can
- README da duoc viet lai sach ma hoa va bo sung cac API moi.

### Kiem tra bo sung

- Bo sung test backend cho:
  - sua nhan vien
  - xoa mem nhan vien
  - xem anh face sample
  - thay 1 face sample
- Cap nhat test frontend cho:
  - tao/sua/xoa nhan vien
  - thay rieng 1 anh khuon mat

## Cap nhat bang nhan vien va bo loc cham cong theo phong ban/chuc vu

### File lien quan

- `backend/app/models.py`
- `backend/app/__init__.py`
- `backend/app/services/auth.py`
- `backend/app/services/attendance.py`
- `backend/app/routes/manager.py`
- `backend/tests/test_manager_api.py`
- `backend/tests/test_manager_attendance_api.py`
- `frontend/src/lib/attendanceApi.js`
- `frontend/src/pages/EmployeeListPage.jsx`
- `frontend/src/pages/AttendancePage.jsx`
- `frontend/src/pages/EmployeeListPage.test.jsx`
- `frontend/src/pages/AttendancePage.test.jsx`
- `README.md`

### Noi dung

- Them truong `department` cho model `Employee` va schema update nhe cho database cu.
- Dong bo `department` qua serializer, API tao nhan vien va API sua nhan vien.
- Bang nhan vien duoc tach ro cac cot:
  - Ho ten nhan vien
  - Ma nhan vien
  - Phong ban
  - Chuc vu
  - Cac thong ke co ban van duoc giu nguyen
- Form tao/sua nhan vien hien nhap du ca `Phong ban` va `Chuc vu`.
- Attendance API nhan them query `department` va `position` de loc ngay tu backend.
- Trang cham cong them 2 bo loc moi:
  - phong ban
  - chuc vu
- Danh sach chuc vu tren trang cham cong duoc gioi han theo phong ban dang chon de bo loc gon hon.
- Bang lich su cham cong hien them cot `Phong ban` va `Chuc vu`.

### Kiem tra bo sung

- Bo sung test backend cho:
  - luu `department` khi tao/sua nhan vien
  - loc attendance theo `department` va `position`
- Cap nhat test frontend cho:
  - tao/sua nhan vien voi `Phong ban` va `Chuc vu`
  - bo loc attendance theo `Phong ban` va `Chuc vu`

## Viet hoa trang guest va dieu huong logout ve trang quet khuon mat

### File lien quan

- `frontend/src/components/ManagerLayout.jsx`
- `frontend/src/pages/GuestCheckinPage.jsx`
- `frontend/src/pages/GuestCheckinPage.test.jsx`
- `WORKLOG_SINCE_CLONE.md`

### Noi dung

- Doi cac nhan chinh tren trang guest sang tieng Viet co dau.
- Giu nguyen luong quet khuon mat, chi doi tieu de, thong diep va nhan hien thi.
- Nut `Dang xuat` trong khu manager nay se logout roi dieu huong thang ve `/`, tuc trang chu quet khuon mat.

## Viet hoa trang tong quan

### File lien quan

- `frontend/src/pages/DashboardPage.jsx`
- `WORKLOG_SINCE_CLONE.md`

### Noi dung

- Doi toan bo text chinh tren trang tong quan sang tieng Viet co dau.
- Viet hoa cac KPI, nhan the thong ke, canh bao AI va empty state.
- Doi thu trong tuan tren bieu do sang dang viet tat tieng Viet.
- Doi nhan trang thai check-in hien thi tren dashboard tu `On-time` / `Late` sang `Dung gio` / `Di muon`.

## Viet hoa dong bo toan bo giao dien frontend

### File lien quan

- `frontend/src/components/ManagerLayout.jsx`
- `frontend/src/components/ProtectedRoute.jsx`
- `frontend/src/hooks/useGuestCamera.js`
- `frontend/src/pages/ManagerLoginPage.jsx`
- `frontend/src/pages/AttendancePage.jsx`
- `frontend/src/pages/EmployeeListPage.jsx`
- `frontend/src/pages/EmployeeFacesPage.jsx`
- `frontend/src/pages/ReportsPage.jsx`
- `frontend/src/pages/GuestCheckinPage.jsx`
- `frontend/src/pages/LandingPage.jsx`
- `frontend/src/App.test.jsx`
- `frontend/src/App.attendance.test.jsx`
- `frontend/src/pages/ManagerLoginPage.test.jsx`
- `frontend/src/pages/AttendancePage.test.jsx`
- `frontend/src/pages/EmployeeListPage.test.jsx`
- `frontend/src/pages/EmployeeFacesPage.test.jsx`
- `frontend/src/components/ManagerLayout.test.jsx`

### Noi dung

- Ra soat lai cac trang frontend va doi cac text con tieng Anh, khong dau hoac loi ma hoa sang tieng Viet co dau.
- Dong bo lai nhan tren cac man:
  - dang nhap quan tri
  - tong quan
  - nhan vien
  - khuon mat nhan vien
  - cham cong
  - bao cao
  - trang chu quet khuon mat
- Doi them mot so nhan he thong de de hieu hon:
  - `On-time` -> `Dung gio`
  - `Late` -> `Di muon`
  - `snapshot` -> `anh chup`
  - `confidence` -> `do khop`
- Cap nhat lai test frontend de khop voi text va luong dieu huong moi.
