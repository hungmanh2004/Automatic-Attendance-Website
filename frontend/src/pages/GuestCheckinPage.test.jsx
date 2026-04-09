import { createRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import GuestCheckinPage from "./GuestCheckinPage";

let cameraMode = "ready";
let intervalCallbacks = [];
const submitGuestCheckin = vi.fn();
const captureGuestFrame = vi.fn();
const retryCamera = vi.fn();
const stopCamera = vi.fn();

function getCameraState() {
  if (cameraMode === "denied") {
    return {
      cameraError: "Quyền camera đã bị từ chối. Hãy cho phép camera và thử lại.",
      cameraState: "denied",
    };
  }

  if (cameraMode === "unavailable") {
    return {
      cameraError: "Không tìm thấy camera phù hợp trên thiết bị này.",
      cameraState: "unavailable",
    };
  }

  return {
    cameraError: "",
    cameraState: "ready",
  };
}

function renderGuestPage() {
  return render(
    <MemoryRouter>
      <GuestCheckinPage />
    </MemoryRouter>,
  );
}

vi.mock("../hooks/useGuestCamera", () => ({
  useGuestCamera: () => ({
    ...getCameraState(),
    retryCamera,
    stopCamera,
    videoRef: createRef(),
  }),
}));

vi.mock("../lib/guestApi", () => ({
  captureGuestFrame: (...args) => captureGuestFrame(...args),
  submitGuestCheckin: (...args) => submitGuestCheckin(...args),
}));

describe("GuestCheckinPage", () => {
  beforeEach(() => {
    cameraMode = "ready";
    intervalCallbacks = [];
    submitGuestCheckin.mockReset();
    captureGuestFrame.mockReset();
    retryCamera.mockReset();
    stopCamera.mockReset();

    vi.spyOn(window, "setInterval").mockImplementation((callback) => {
      intervalCallbacks.push(callback);
      return intervalCallbacks.length;
    });
    vi.spyOn(window, "clearInterval").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the guest check-in camera page", () => {
    renderGuestPage();

    expect(screen.getByRole("heading", { name: /điểm danh khuôn mặt thông minh/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dừng quét/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /mở khu quản trị/i })).toBeInTheDocument();
  });

  it("renders unknown and multiple_faces result copy", async () => {
    captureGuestFrame.mockResolvedValue(new File(["guest"], "guest-frame.jpg", { type: "image/jpeg" }));
    submitGuestCheckin.mockResolvedValueOnce({ status: "unknown" }).mockResolvedValueOnce({
      status: "multiple_faces",
    });

    renderGuestPage();

    await act(async () => {
      await intervalCallbacks[0]();
    });

    expect(screen.getByText(/hệ thống chưa xác định được khuôn mặt/i)).toBeInTheDocument();

    await act(async () => {
      await intervalCallbacks[0]();
    });

    expect(screen.getByText(/chỉ cần một người trong khung hình/i)).toBeInTheDocument();
  });

  it("auto-scans one frame at a time and shows success cooldown", async () => {
    captureGuestFrame.mockResolvedValue(new File(["guest"], "guest-frame.jpg", { type: "image/jpeg" }));
    submitGuestCheckin.mockResolvedValue({
      checked_in_at: "2026-04-02T10:00:00Z",
      employee_code: "NV001",
      full_name: "Nguyễn Văn A",
      snapshot_path: "/tmp/checkin.jpg",
      status: "recognized",
    });

    renderGuestPage();

    expect(intervalCallbacks).toHaveLength(1);

    await act(async () => {
      await intervalCallbacks[0]();
    });

    await waitFor(() => expect(submitGuestCheckin).toHaveBeenCalledTimes(1));
    expect(captureGuestFrame).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/điểm danh thành công/i)).toBeInTheDocument();
    expect(screen.getByText(/NV001/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Nguyễn Văn A/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/tự động tiếp tục sau 5 giây/i).length).toBeGreaterThan(0);
  });

  it("prevents overlapping submissions while a request is in flight", async () => {
    let resolveSubmit;
    const pendingSubmit = new Promise((resolve) => {
      resolveSubmit = resolve;
    });

    captureGuestFrame.mockResolvedValue(new File(["guest"], "guest-frame.jpg", { type: "image/jpeg" }));
    submitGuestCheckin.mockReturnValue(pendingSubmit);

    renderGuestPage();

    await act(async () => {
      await intervalCallbacks[0]();
    });

    expect(submitGuestCheckin).toHaveBeenCalledTimes(1);

    await act(async () => {
      await intervalCallbacks[0]();
    });

    expect(submitGuestCheckin).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSubmit({ status: "no_face" });
      await pendingSubmit;
    });
  });

  it("allows manual resume during cooldown", async () => {
    captureGuestFrame.mockResolvedValue(new File(["guest"], "guest-frame.jpg", { type: "image/jpeg" }));
    submitGuestCheckin.mockResolvedValue({
      checked_in_at: "2026-04-02T10:00:00Z",
      employee_code: "NV002",
      full_name: "Nguyễn Văn B",
      snapshot_path: "/tmp/checkin-2.jpg",
      status: "recognized",
    });

    renderGuestPage();

    await act(async () => {
      await intervalCallbacks[0]();
    });

    expect(screen.getAllByText(/tự động tiếp tục sau 5 giây/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /bắt đầu quét/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /bắt đầu quét/i }));

    expect(screen.queryByText(/tự động tiếp tục sau 5 giây/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dừng quét/i })).toBeEnabled();
  });

  it("renders an unavailable camera fallback state with retry and manual upload", async () => {
    cameraMode = "unavailable";

    renderGuestPage();

    expect(screen.getAllByText(/không tìm thấy camera phù hợp trên thiết bị này/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /thử lại camera/i })).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: /tải ảnh thủ công/i }));
    expect(screen.getByLabelText(/ảnh khuôn mặt/i)).toBeInTheDocument();
  });

  it("does not let manual fallback bypass the one-request-at-a-time guard", async () => {
    const user = userEvent.setup();
    let resolveSubmit;
    const pendingSubmit = new Promise((resolve) => {
      resolveSubmit = resolve;
    });

    captureGuestFrame.mockResolvedValue(new File(["guest"], "guest-frame.jpg", { type: "image/jpeg" }));
    submitGuestCheckin.mockReturnValue(pendingSubmit);

    renderGuestPage();

    await user.click(screen.getByRole("button", { name: /tải ảnh thủ công/i }));
    fireEvent.change(screen.getByLabelText(/ảnh khuôn mặt/i), {
      target: { files: [new File(["guest"], "fallback.jpg", { type: "image/jpeg" })] },
    });

    await act(async () => {
      await intervalCallbacks[0]();
    });

    expect(screen.getByRole("button", { name: /gửi ảnh lên ai/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /gửi ảnh lên ai/i }));
    expect(submitGuestCheckin).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSubmit({ status: "no_face" });
      await pendingSubmit;
    });
  });

  it("submits the fallback uploaded image when camera is unavailable", async () => {
    const user = userEvent.setup();
    cameraMode = "unavailable";
    submitGuestCheckin.mockResolvedValue({
      checked_in_at: "2026-04-02T10:00:00Z",
      employee_code: "NV002",
      full_name: "Nguyễn Văn B",
      snapshot_path: "/tmp/checkin-2.jpg",
      status: "already_checked_in",
    });

    renderGuestPage();

    await user.click(screen.getByRole("button", { name: /tải ảnh thủ công/i }));

    const fileInput = screen.getByLabelText(/ảnh khuôn mặt/i);
    const file = new File(["guest"], "fallback.jpg", { type: "image/jpeg" });

    fireEvent.change(fileInput, { target: { files: [file] } });
    await user.click(screen.getByRole("button", { name: /gửi ảnh lên ai/i }));

    await waitFor(() => expect(submitGuestCheckin).toHaveBeenCalledTimes(1));
    expect(submitGuestCheckin).toHaveBeenCalledWith(file);
    expect(screen.getByText(/đã điểm danh/i)).toBeInTheDocument();
  });
});
