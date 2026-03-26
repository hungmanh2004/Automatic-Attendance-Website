# ============================================================
# face_alignment.py - Căn chỉnh khuôn mặt (Face Alignment)
# ============================================================
# Vấn đề:
#   Camera quay người bị nghiêng đầu → ArcFace nhận sai vector
#   → cosine distance vọt lên > 0.35 → "Khong xac dinh"
#
# Giải pháp:
#   Dùng vị trí 2 MẮT từ YOLOv12 Keypoints để tính góc nghiêng,
#   rồi XOAY ảnh cho mặt thẳng lại trước khi đưa vào ArcFace.
#
#   Kỹ thuật: math.atan2 (tính góc) + cv2.warpAffine (xoay ảnh)
#
# Chi phí: ~2-5ms/mặt (không đáng kể vì chạy ở background thread)
# ============================================================

import cv2
import numpy as np
import math


# ============================================================
# Ngưỡng góc tối thiểu để kích hoạt xoay (độ)
# Nếu mặt chỉ nghiêng < 1 độ → không cần xoay, tiết kiệm CPU
# ============================================================
MIN_ANGLE_TO_ALIGN = 1.0

# ============================================================
# Tỷ lệ padding quanh mặt khi xoay
# Giải thích: Khi xoay ảnh, các pixel ở góc bị bay ra ngoài khung.
#   Nếu crop sát mặt rồi mới xoay → mất tai, mất trán.
#   → Cần thêm "viền" (padding) quanh mặt trước khi xoay,
#     rồi crop lại sau khi đã xoay thẳng.
# ============================================================
PADDING_RATIO = 0.5  # Thêm 50% mỗi chiều


def align_face(frame, keypoints, box):
    """
    Xoay thẳng khuôn mặt dựa trên vị trí 2 mắt từ YOLO Keypoints.

    Quy trình:
      1. Lấy tọa độ mắt trái (index 0) và mắt phải (index 1)
      2. Tính góc nghiêng bằng atan2(dy, dx)
      3. Cắt vùng quanh mặt + padding
      4. Xoay vùng đó cho 2 mắt nằm ngang
      5. Crop lại vùng mặt từ ảnh đã xoay

    Args:
        frame:     Ảnh gốc toàn khung hình (numpy array BGR).
        keypoints: Mảng 5 điểm mốc từ YOLO [(x,y), ...]:
                   [mắt_trái, mắt_phải, mũi, mép_trái, mép_phải].
                   Có thể là None nếu YOLO không trả về keypoints.
        box:       Bounding box (x1, y1, x2, y2) từ YOLO boxes.

    Returns:
        numpy array: Ảnh khuôn mặt đã xoay thẳng (BGR).
                     Nếu không xoay được → trả về crop thô như cũ.
    """
    x1, y1, x2, y2 = box
    h_frame, w_frame = frame.shape[:2]

    # Đảm bảo box hợp lệ
    x1 = max(0, x1)
    y1 = max(0, y1)
    x2 = min(w_frame, x2)
    y2 = min(h_frame, y2)

    # ============================================================
    # FALLBACK: Nếu không có keypoints → crop thô (giữ nguyên hành vi cũ)
    # Trường hợp này xảy ra khi:
    #   - Model YOLO không hỗ trợ keypoints
    #   - Khuôn mặt bị che quá nhiều → YOLO không tìm được điểm mốc
    # ============================================================
    default_crop = frame[y1:y2, x1:x2]

    if keypoints is None or len(keypoints) < 2:
        return default_crop

    left_eye = keypoints[0]   # Mắt trái: (x, y)
    right_eye = keypoints[1]  # Mắt phải: (x, y)

    # Kiểm tra keypoints hợp lệ (YOLO trả về (0,0) nếu không detect được mắt)
    if (left_eye[0] == 0 and left_eye[1] == 0) or \
       (right_eye[0] == 0 and right_eye[1] == 0):
        return default_crop

    # ============================================================
    # Bước 1: Tính góc nghiêng giữa 2 mắt
    # ============================================================
    # math.atan2 trả về góc tính bằng radian
    # → Chuyển sang độ bằng math.degrees
    #
    # Ví dụ: Mắt trái ở (100, 200), mắt phải ở (200, 220)
    #   dy = 220 - 200 = 20 (mắt phải thấp hơn 20px)
    #   dx = 200 - 100 = 100
    #   angle = atan2(20, 100) ≈ 11.3 độ → mặt nghiêng 11.3 độ bên phải
    # ============================================================
    dy = right_eye[1] - left_eye[1]
    dx = right_eye[0] - left_eye[0]
    angle = math.degrees(math.atan2(dy, dx))

    # Nếu góc quá nhỏ → không cần xoay, tiết kiệm CPU
    if abs(angle) < MIN_ANGLE_TO_ALIGN:
        return default_crop

    # ============================================================
    # Bước 2: Cắt vùng quanh mặt + padding
    # ============================================================
    # Tại sao không xoay cả frame?
    #   Frame 640x480 = 307,200 pixel → xoay mất ~2ms
    #   Vùng mặt 200x200 + pad = 300x300 = 90,000 pixel → xoay mất <1ms
    #   → Tiết kiệm 50% thời gian!
    # ============================================================
    face_w = x2 - x1
    face_h = y2 - y1
    pad = int(max(face_w, face_h) * PADDING_RATIO)

    # Vùng cắt có padding (clamp vào biên ảnh)
    px1 = max(0, x1 - pad)
    py1 = max(0, y1 - pad)
    px2 = min(w_frame, x2 + pad)
    py2 = min(h_frame, y2 + pad)

    padded_region = frame[py1:py2, px1:px2]

    # ============================================================
    # Bước 3: Xoay vùng đã cắt cho mặt thẳng
    # ============================================================
    # Điểm xoay = trung tâm giữa 2 mắt (chuyển sang tọa độ local)
    local_center = (
        (left_eye[0] + right_eye[0]) / 2.0 - px1,
        (left_eye[1] + right_eye[1]) / 2.0 - py1
    )

    # Ma trận xoay 2x3 (xoay quanh center, góc = angle, scale = 1.0)
    M = cv2.getRotationMatrix2D(local_center, angle, 1.0)

    # Thực hiện xoay ảnh
    ph, pw = padded_region.shape[:2]
    rotated = cv2.warpAffine(
        padded_region, M, (pw, ph),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE  # Lấp pixel trống bằng pixel biên
    )

    # ============================================================
    # Bước 4: Tính lại tọa độ box sau khi xoay
    # ============================================================
    # 4 góc của box gốc (tọa độ local trong vùng padded)
    corners = np.array([
        [x1 - px1, y1 - py1],
        [x2 - px1, y1 - py1],
        [x2 - px1, y2 - py1],
        [x1 - px1, y2 - py1]
    ], dtype=np.float64)

    # Thêm cột 1 để nhân ma trận affine (2x3 × 3xN)
    ones = np.ones((4, 1))
    corners_h = np.hstack([corners, ones])
    new_corners = (M @ corners_h.T).T  # shape (4, 2)

    # Bounding box mới bao trọn 4 góc đã xoay
    nx1 = max(0, int(new_corners[:, 0].min()))
    ny1 = max(0, int(new_corners[:, 1].min()))
    nx2 = min(pw, int(new_corners[:, 0].max()))
    ny2 = min(ph, int(new_corners[:, 1].max()))

    # ============================================================
    # Bước 5: Crop mặt đã xoay thẳng
    # ============================================================
    aligned_face = rotated[ny1:ny2, nx1:nx2]

    # An toàn: nếu crop bị rỗng → dùng crop thô
    if aligned_face.size == 0:
        return default_crop

    return aligned_face
