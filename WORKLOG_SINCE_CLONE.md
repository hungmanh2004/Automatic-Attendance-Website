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

## Cap nhat trang scanner khuon mat nhan vien cho admin (2026-04-13 11:03:46)

### File lien quan

- `frontend/src/pages/EmployeeFaceScannerPage.jsx`
- `frontend/src/pages/EmployeeFaceScannerPage.override.css`
- `frontend/src/hooks/useFaceRegistration.js`
- `frontend/src/pages/EmployeeFaceScannerPage.test.jsx`
- `WORKLOG_SINCE_CLONE.md`

### Noi dung

- Tach rieng style override cho trang scanner de tranh bi anh huong boi cac block CSS cu trong `styles.css`.
- Don gian hoa giao dien scanner theo huong mot trang rieng cho admin, khong con layout scanner cu phuc tap.
- Nang cap khung scanner theo phong cach biometric / Face ID:
  - video dong vai tro background
  - vung nhan dien oval o giua
  - them orbit ring, radar, arc, scan line va glow
  - orbit va cum scanner lech huong theo pose khuon mat `front/left/right/up/down`
- Sua lai layout scanner de tranh bi de control bar va caption xuong sat gallery.
- Bo cuc responsive duoc dieu chinh lai cho tablet/mobile de status, guidance panel va control bar khong de len nhau.
- Doi luong capture sang tu dong:
  - khong can bam `Luu dinh danh` de chup
  - he thong tu lay frame tot nhat cho tung goc khi nguoi dung giu dung huong
  - du 5 goc thi tu dong gui len backend
- Nut cuoi tren scanner chi con dong vai tro retry neu tu dong luu that bai.
- Cap nhat lai test trang scanner theo luong moi `tu dong giu anh tot nhat` va `tu dong luu`.

### Kiem tra bo sung

- `npm test -- EmployeeFaceScannerPage.test.jsx`: pass
- `npm run build`: pass

### Luu y lam viec

- Moi thay doi tiep theo lien quan den scanner khuon mat admin can duoc ghi bo sung vao `WORKLOG_SINCE_CLONE.md`.

## Toi uu lai man hinh khoi tao camera / scanner cho ro bo cuc hon (2026-04-13 11:03:46)

### File lien quan

- `frontend/src/pages/EmployeeFaceScannerPage.jsx`
- `frontend/src/pages/EmployeeFaceScannerPage.override.css`
- `frontend/src/pages/EmployeeFaceScannerPage.test.jsx`
- `WORKLOG_SINCE_CLONE.md`

### Noi dung

- Chi tap trung sua UI cua man scanner dang hien thi, khong thay doi them flow backend hay man hinh khac.
- Giam bot do roi cua background biometric:
  - bo bot vong sang nen
  - ha do sang / do tuong phan cua animation
  - giu mot cum scanner trung tam ro rang hon
- Bo kieu banner ngang de giua man hinh, thay bang mot card thong tin nho gon o nua duoi trung tam.
- Dinh lai hierarchy trong card scanner:
  - dong trang thai nho
  - tieu de chinh
  - mo ta ngan
  - 3 buoc tien trinh nho
  - nut chi hien thi khi dung ngu canh
- Nut `Tu dong luu` khong con hien nhu mot CTA chinh tren man loading; hanh dong retry chi xuat hien khi luu that bai.
- Dua cac nut tien ich nho `lam lai / chup lai` sang mot utility dock rieng de khong pha bo cuc chinh.
- Scanner visual van giu chat biometric nhung tro thanh background ho tro, khong lan at text.
- Cap nhat test frontend de khop voi card khoi tao camera moi.

### Kiem tra bo sung

- `npm test -- EmployeeFaceScannerPage.test.jsx`: pass
- `npm run build`: pass

## Sua KPI dashboard de khong tinh nhan vien da xoa mem vao muc can theo doi (2026-04-13 11:03:46)

### File lien quan

- `backend/app/services/attendance.py`
- `backend/tests/test_manager_api.py`
- `WORKLOG_SINCE_CLONE.md`

### Noi dung

- Sua `get_dashboard_summary()` de cac chi so tong quan chi tinh nhan vien con hoat dong (`is_active = true`).
- Khi nhan vien bi xoa mem o trang nhan vien, KPI tren trang tong quan se giam dung theo so nhan vien active con lai.
- Cac gia tri duoc sua tac dong truc tiep den:
  - `summary.total_employees`
  - `summary.absent_today`
  - `summary.attendance_rate`
  - danh sach `employee_stats`
- Bo sung test hoi quy de dam bao sau khi xoa mem nhan vien, dashboard khong con tinh nhan vien do vao muc can theo doi.


## Chinh lai cum nut thao tac o bang nhan vien cho deu va nhat quan (2026-04-13 11:03:46)

### File lien quan

- `frontend/src/pages/EmployeeListPage.jsx`
- `frontend/src/styles.css`
- `WORKLOG_SINCE_CLONE.md`

### Noi dung

- Tach rieng 2 nhom nut o cot thao tac trong bang nhan vien.
- `Face Manager` va `Face Scanner` dung cung mot form nut chinh, deu kich thuoc va padding.
- `Sua` va `Xoa` dung cung mot form nut utility nho hon, can hang va dong deu hon voi nhom nut chinh.
- Bo sung responsive de cum nut nay xuong hang gon hon tren man hinh hep.


## Co dinh do rong 2 nut chinh o bang nhan vien de can deu hon (2026-04-13 11:03:46)

### File lien quan

- `frontend/src/styles.css`
- `WORKLOG_SINCE_CLONE.md`

### Noi dung

- Chuyen cum nut thao tac o bang nhan vien sang bo cuc flex de de can hang hon.
- Co dinh cung mot do rong cho `Face Manager` va `Face Scanner` de 2 nut chinh nhin thang hang va deu nhau hon.
- Giu nguyen co che responsive da bo sung truoc do cho man hinh hep.


## Bo sung backend dang ky khuon mat theo batch 20-30 frame cat tu video (2026-04-13 11:03:46)

### File lien quan

- `backend/app/models.py`
- `backend/app/routes/face_enrollment.py`
- `backend/app/services/face_batch_enrollment.py`
- `backend/app/services/face_index.py`
- `backend/tests/test_manager_face_enrollment_api.py`
- `backend/tests/test_manager_api.py`
- `WORKLOG_SINCE_CLONE.md`

### Noi dung

- Giu nguyen `FaceSample` de luu 5 anh final cho UI manager hien tai.
- Them model `FaceEmbedding` de luu 1 mean embedding va cac representative embedding tach rieng khoi 5 preview samples.
- Them route `POST /api/manager/employees/<id>/face-enrollment/batch` nhan batch 20-30 frame tu frontend.
- Them service `face_batch_enrollment` de loc frame hop le, bo frame trung, cham diem chat luong co ban va chon 5 preview theo cac pose `front/left/right/up/down`.
- Cap nhat `FaceIndexService` de uu tien doc `FaceEmbedding`, nhung van fallback ve `FaceSample` de giu tuong thich du lieu cu.
- Cap nhat cleanup khi xoa khuon mat / xoa nhan vien de xoa ca `FaceEmbedding` moi.
- Bo sung regression test cho batch enrollment va cleanup embedding moi.


## Kiem tra va reset lai tai khoan admin local de dang nhap duoc (2026-04-13 11:03:46)

### File lien quan

- `backend/data/app.db`
- `WORKLOG_SINCE_CLONE.md`

### Noi dung

- Xac nhan backend khong crash o startup; route login van hoat dong binh thuong.
- Kiem tra SQLite local va xac nhan tai khoan `admin` van ton tai trong bang `manager_users`.
- Reset lai mat khau local cua tai khoan `admin` ve `secret123` de khoi phuc truy cap admin tren may dang lam viec.
- Verify lai bang request login va `/api/manager/me` trong app context: deu tra `200`.


## Noi frontend scanner voi backend batch enrollment 20-30 frame (2026-04-13 11:03:46)

### File lien quan

- `frontend/src/lib/faceApiService.js`
- `frontend/src/hooks/useFaceRegistration.js`
- `WORKLOG_SINCE_CLONE.md`

### Noi dung

- Giu nguyen giao dien scanner hien tai, khong doi bo cuc hay luong tuong tac chinh.
- Sua `faceApiService` de bo mock endpoint cu va gui `frames[]` len route moi `/api/manager/employees/<id>/face-enrollment/batch`.
- Trong `useFaceRegistration`, bo sung co che am tham thu gom 20-30 frame trong luc quet 5 goc cu de backend batch co du du lieu xu ly.
- Van giu 5 anh preview local cho UI, nhung viec luu xuong server gio di theo batch frame thay vi chi 5 anh tinh.
- Build frontend pass sau khi noi flow moi.


## Chay smoke test HTTP localhost cho login admin va batch enrollment 20 frame (2026-04-13 11:03:46)

### File lien quan

- `backend/data/http_e2e_server.py`
- `WORKLOG_SINCE_CLONE.md`

### Noi dung

- Dung mot server localhost tam de verify luong HTTP that thay vi chi test client noi bo.
- Xac nhan `POST /api/manager/login` tra `200` voi tai khoan `admin / secret123`.
- Xac nhan `POST /api/manager/employees/<id>/face-enrollment/batch` voi 20 frame tra `201`.
- Ket qua smoke test localhost: luu duoc `5` preview samples, tao embeddings dai dien va cleanup ve `0` ban ghi sau khi goi xoa face samples.


## Sua loi encoding tieng Viet o scanner sau khi noi batch backend (2026-04-13 11:03:46)

### File lien quan

- `frontend/src/hooks/useFaceRegistration.js`
- `frontend/src/lib/faceApiService.js`
- `WORKLOG_SINCE_CLONE.md`

### Noi dung

- Sua lai cac chuoi tieng Viet bi mojibake trong hook scanner va API client sau lan ghi file truoc do.
- Cac nhan nhu `Nh?n th?ng`, `Quay tr?i`, `Nh?n l?n`, thong bao guidance va message upload da hien thi dung UTF-8 tro lai.
- Verify lai bang `npm run build` va `npm test -- EmployeeFaceScannerPage.test.jsx`: deu pass.


## Sua regression sau rebase o luong thay anh mau khuon mat (2026-04-13 12:20:00)

### File lien quan

- `backend/app/routes/face_enrollment.py`
- `backend/tests/test_manager_face_enrollment_api.py`
- `.gitignore`
- `WORKLOG_SINCE_CLONE.md`

### Noi dung

- Sua luong `PUT /api/manager/employees/<id>/face-samples/<sample_index>` de khi admin thay anh mau thi xoa bo `FaceEmbedding` cu cua nhan vien do.
- Muc tieu la tranh tinh trang matcher van uu tien dung embedding batch cu sau khi UI da doi anh preview.
- Bo sung regression test cho case thay anh mau sau batch enrollment de khoa lai hanh vi nay.
- Xoa file rac `.branch.swp` bi commit nham khi rebase va them `*.swp` vao `.gitignore` de tranh lap lai.
