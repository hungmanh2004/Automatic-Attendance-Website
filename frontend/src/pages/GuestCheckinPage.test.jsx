import { createRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import GuestCheckinPage from "./GuestCheckinPage";

let cameraMode = "ready";
let yoloResult = null;
const retryCamera = vi.fn();
const stopCamera = vi.fn();
const submitGuestCheckinKpts = vi.fn();
const waitGuestCheckinTaskResult = vi.fn();

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

vi.mock("../hooks/useYoloDetection", () => ({
  useYoloDetection: () => ({
    detections: [],
    getTracksSnapshot: () => [],
    lastResult: yoloResult,
    modelProgress: 100,
    modelState: "ready",
  }),
}));

vi.mock("../lib/guestApi", () => ({
  submitGuestCheckinKpts: (...args) => submitGuestCheckinKpts(...args),
  waitGuestCheckinTaskResult: (...args) => waitGuestCheckinTaskResult(...args),
}));

describe("GuestCheckinPage", () => {
  beforeEach(() => {
    cameraMode = "ready";
    yoloResult = null;
    retryCamera.mockReset();
    stopCamera.mockReset();
    submitGuestCheckinKpts.mockReset();
    waitGuestCheckinTaskResult.mockReset();

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 120 })),
      strokeRect: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the guest check-in camera page", () => {
    const { container } = renderGuestPage();

    expect(screen.getByRole("heading", { name: /điểm danh khuôn mặt thông minh/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /mở khu quản trị/i })).toBeInTheDocument();
    expect(screen.getByText(/camera đang quét liên tục/i)).toBeInTheDocument();
    expect(container.querySelector(".kiosk-video--mirrored")).toBeInTheDocument();
    expect(container.querySelector(".kiosk-detection-canvas")).toBeInTheDocument();
  });

  it("renders unknown and multiple_faces result copy", async () => {
    yoloResult = { status: "unknown" };

    const { unmount } = renderGuestPage();

    expect(await screen.findByText(/hệ thống chưa xác định được khuôn mặt/i)).toBeInTheDocument();

    unmount();
    yoloResult = { status: "multiple_faces" };
    renderGuestPage();

    expect(await screen.findByText(/chỉ cần một người trong khung hình/i)).toBeInTheDocument();
  });

  it("shows a recognized YOLO result and records it in history", async () => {
    yoloResult = {
      checked_in_at: "2026-04-02T10:00:00Z",
      employee_code: "NV001",
      employee_id: 7,
      full_name: "Nguyễn Văn A",
      status: "recognized",
    };

    renderGuestPage();

    expect(await screen.findByText(/điểm danh thành công/i)).toBeInTheDocument();
    expect(screen.getByText(/NV001/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Nguyễn Văn A/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/recognized/i).length).toBeGreaterThan(0);
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
    submitGuestCheckinKpts.mockReturnValue(pendingSubmit);

    renderGuestPage();

    await user.click(screen.getByRole("button", { name: /tải ảnh thủ công/i }));
    fireEvent.change(screen.getByLabelText(/ảnh khuôn mặt/i), {
      target: { files: [new File(["guest"], "fallback.jpg", { type: "image/jpeg" })] },
    });

    await user.click(screen.getByRole("button", { name: /gửi ảnh lên ai/i }));
    expect(screen.getByRole("button", { name: /gửi ảnh lên ai/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /gửi ảnh lên ai/i }));
    expect(submitGuestCheckinKpts).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSubmit({ status: "no_face" });
      await pendingSubmit;
    });
    await waitFor(() => expect(screen.getByRole("button", { name: /gửi ảnh lên ai/i })).toBeEnabled());
  });

  it("submits the fallback uploaded image when camera is unavailable", async () => {
    const user = userEvent.setup();
    cameraMode = "unavailable";
    submitGuestCheckinKpts.mockResolvedValue({
      checked_in_at: "2026-04-02T10:00:00Z",
      employee_code: "NV002",
      full_name: "Nguyễn Văn B",
      status: "already_checked_in",
    });

    renderGuestPage();

    await user.click(screen.getByRole("button", { name: /tải ảnh thủ công/i }));

    const fileInput = screen.getByLabelText(/ảnh khuôn mặt/i);
    const file = new File(["guest"], "fallback.jpg", { type: "image/jpeg" });

    fireEvent.change(fileInput, { target: { files: [file] } });
    await user.click(screen.getByRole("button", { name: /gửi ảnh lên ai/i }));

    await waitFor(() => expect(submitGuestCheckinKpts).toHaveBeenCalledTimes(1));
    expect(submitGuestCheckinKpts).toHaveBeenCalledWith(file, null);
    expect(screen.getByText(/đã điểm danh/i)).toBeInTheDocument();
  });

  it("resolves queued manual check-in before showing the result", async () => {
    const user = userEvent.setup();
    submitGuestCheckinKpts.mockResolvedValue({ status: "queued", task_id: "task-123" });
    waitGuestCheckinTaskResult.mockResolvedValue({
      checked_in_at: "2026-04-21T08:00:00",
      full_name: "Ada Lovelace",
      status: "recognized",
    });

    renderGuestPage();

    await user.click(screen.getByRole("button", { name: /tải ảnh thủ công/i }));
    const file = new File(["face"], "face.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText(/ảnh khuôn mặt/i), {
      target: { files: [file] },
    });
    await user.click(screen.getByRole("button", { name: /gửi ảnh lên ai/i }));

    expect((await screen.findAllByText(/Ada Lovelace/i)).length).toBeGreaterThan(0);
    expect(submitGuestCheckinKpts).toHaveBeenCalledWith(file, null);
    expect(waitGuestCheckinTaskResult).toHaveBeenCalledWith("task-123");
  });
});
