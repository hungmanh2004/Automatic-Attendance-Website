# ============================================================
# attendance_logger.py - Module Ghi Nhận Điểm Danh
# ============================================================
# Chức năng:
#   1. Ghi tên + timestamp vào file CSV cục bộ
#   2. Đồng bộ lên Google Sheets (qua Service Account)
#   3. Chống điểm danh trùng lặp trong ngày (Cache)
#   4. Ghi log Google Sheet chạy ở luồng nền (không block camera)
#
# Sử dụng: import từ webcam.py
# ============================================================

import os
import csv
from datetime import datetime, date
from concurrent.futures import ThreadPoolExecutor

import gspread
from oauth2client.service_account import ServiceAccountCredentials

# ============================================================
# CẤU HÌNH
# ============================================================
CREDENTIALS_FILE = "credentials.json"                          # File khóa Google Service Account
GOOGLE_SHEET_ID = os.getenv("GOOGLE_SHEET_ID")  # ID của Google Sheet
CSV_FOLDER = "attendance_logs"                                 # Thư mục lưu file CSV


class AttendanceLogger:
    """
    Quản lý toàn bộ việc ghi nhận điểm danh.
    - Dùng set() để cache những người đã điểm danh hôm nay.
    - Ghi file CSV cục bộ (đọc được bằng Excel).
    - Đẩy lên Google Sheets qua luồng nền (không block camera).
    """

    def __init__(self):
        # ============================================================
        # Cache chống trùng lặp: set chứa các tên đã điểm danh HÔM NAY
        # Khi qua ngày mới, cache sẽ tự động reset.
        # ============================================================
        self._today = date.today()
        self._attended_today = set()

        # Tạo thư mục lưu CSV nếu chưa có
        os.makedirs(CSV_FOLDER, exist_ok=True)

        # Nạp lại cache từ file CSV của ngày hôm nay (nếu đã tồn tại)
        # → Đề phòng trường hợp anh tắt app rồi mở lại trong ngày
        self._load_today_cache()

        # ============================================================
        # Kết nối Google Sheets (1 lần duy nhất khi khởi tạo)
        # ============================================================
        self._sheet = None
        try:
            scope = [
                "https://spreadsheets.google.com/feeds",
                "https://www.googleapis.com/auth/drive"
            ]
            creds = ServiceAccountCredentials.from_json_keyfile_name(CREDENTIALS_FILE, scope)
            client = gspread.authorize(creds)
            self._sheet = client.open_by_key(GOOGLE_SHEET_ID).sheet1
            print("[AttendanceLogger] Đã kết nối Google Sheets thành công!")
        except Exception as e:
            print(f"[AttendanceLogger] Cảnh báo: Không kết nối được Google Sheets: {e}")
            print("[AttendanceLogger] Hệ thống vẫn ghi CSV bình thường.")

        # ============================================================
        # ThreadPoolExecutor: Chuyên gửi dữ liệu lên Google Sheet
        # ở luồng nền. Camera KHÔNG bị block dù mạng Internet chậm.
        # max_workers=1: chỉ cần 1 luồng, tránh gửi song song gây lỗi.
        # ============================================================
        self._executor = ThreadPoolExecutor(max_workers=1)

    def _get_csv_path(self):
        """Tạo đường dẫn file CSV theo ngày, VD: attendance_logs/2026-03-25.csv"""
        return os.path.join(CSV_FOLDER, f"{self._today.isoformat()}.csv")

    def _load_today_cache(self):
        """
        Đọc file CSV của ngày hôm nay (nếu có) và nạp tên vào cache.
        Mục đích: Nếu anh tắt app rồi mở lại, hệ thống vẫn nhớ ai đã điểm danh.
        """
        csv_path = self._get_csv_path()
        if os.path.exists(csv_path):
            with open(csv_path, "r", encoding="utf-8") as f:
                reader = csv.reader(f)
                next(reader, None)  # Bỏ qua dòng tiêu đề (header)
                for row in reader:
                    if len(row) >= 3:
                        self._attended_today.add(row[2])  # Cột thứ 3 là tên
            print(f"[AttendanceLogger] Đã nạp {len(self._attended_today)} người từ CSV ngày hôm nay.")

    def _check_new_day(self):
        """Kiểm tra xem có phải ngày mới chưa. Nếu rồi → xóa cache cũ."""
        today = date.today()
        if today != self._today:
            self._today = today
            self._attended_today.clear()
            print(f"[AttendanceLogger] Ngày mới ({today}), đã reset cache điểm danh.")

    def _write_csv(self, name, timestamp):
        """Ghi 1 dòng vào file CSV cục bộ."""
        csv_path = self._get_csv_path()
        file_exists = os.path.exists(csv_path)

        with open(csv_path, "a", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            # Nếu file mới tạo → ghi dòng tiêu đề trước
            if not file_exists:
                writer.writerow(["Date", "Time", "Name"])
            writer.writerow([
                timestamp.strftime("%Y-%m-%d"),
                timestamp.strftime("%H:%M:%S"),
                name
            ])

    def _write_google_sheet(self, name, timestamp):
        """
        Ghi 1 dòng lên Google Sheets.
        Hàm này được gọi từ luồng nền (ThreadPoolExecutor),
        KHÔNG BAO GIỜ block camera dù mạng Internet chậm 3 giây.
        """
        if self._sheet is None:
            return
        try:
            self._sheet.append_row([
                timestamp.strftime("%Y-%m-%d"),
                timestamp.strftime("%H:%M:%S"),
                name
            ])
        except Exception as e:
            print(f"[AttendanceLogger] Lỗi ghi Google Sheets: {e}")

    # ============================================================
    # HÀM CHÍNH: log_attendance(name)
    # Gọi hàm này từ webcam.py mỗi khi nhận diện thành công.
    # Nó sẽ tự động kiểm tra trùng lặp, ghi CSV, và đẩy GSheet.
    # ============================================================
    def log_attendance(self, name):
        """
        Ghi nhận điểm danh cho 1 người.

        Args:
            name: Tên người được nhận diện (PK từ database).

        Returns:
            True  nếu đã ghi nhận thành công (người mới trong ngày).
            False nếu bỏ qua (đã điểm danh rồi).
        """
        # Kiểm tra ngày mới
        self._check_new_day()

        # Kiểm tra trùng lặp: nếu người này đã điểm danh hôm nay → bỏ qua
        if name in self._attended_today:
            return False

        # Ghi nhận điểm danh
        timestamp = datetime.now()

        # 1. Thêm vào cache (tức thì, O(1))
        self._attended_today.add(name)

        # 2. Ghi CSV (cực nhanh, ghi file cục bộ)
        self._write_csv(name, timestamp)

        # 3. Đẩy lên Google Sheets (LUỒNG NỀN - không block camera)
        self._executor.submit(self._write_google_sheet, name, timestamp)

        print(f"[AttendanceLogger] ✅ Đã điểm danh: {name} lúc {timestamp.strftime('%H:%M:%S')}")
        return True

    def shutdown(self):
        """Dọn dẹp tài nguyên khi thoát app."""
        self._executor.shutdown(wait=True)
        print("[AttendanceLogger] Đã đóng kết nối.")
