import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";

vi.mock("./hooks/useGuestCamera", () => ({
  useGuestCamera: () => ({
    cameraError: "",
    cameraState: "ready",
    retryCamera: vi.fn(),
    stopCamera: vi.fn(),
    videoRef: { current: null },
  }),
}));

vi.mock("./hooks/useYoloDetection", () => ({
  useYoloDetection: () => ({
    getTracksSnapshot: vi.fn(() => []),
    lastResult: null,
    modelProgress: 0,
    modelState: "ready",
  }),
}));

vi.mock("./lib/guestApi", () => ({
  captureGuestFrame: vi.fn(),
  submitGuestCheckin: vi.fn(),
  waitGuestCheckinTaskResult: vi.fn(),
}));

describe("App routing", () => {
  it("renders the guest check-in page on /guest", () => {
    render(
      <MemoryRouter initialEntries={["/guest"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /điểm danh khuôn mặt thông minh/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /camera lỗi\? tải ảnh thủ công/i })).toBeInTheDocument();
  });
});
