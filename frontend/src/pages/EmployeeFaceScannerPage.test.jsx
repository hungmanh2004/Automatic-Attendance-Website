import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import { renderApp } from "../test/test-utils";

function mockJsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Employee face scanner page", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });

    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the scanner page with a compact preparation card", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(mockJsonResponse({ manager: { id: 1, username: "manager" } }))
        .mockResolvedValueOnce(
          mockJsonResponse({
            employee: { id: 1, employee_code: "NV001", full_name: "Nguyen Van A", department: "Accounting" },
            face_samples: [],
          }),
        ),
    );

    renderApp("/manager/employees/1/face-registration");

    expect(await screen.findByText(/mã nhân viên: nv001/i)).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /đang khởi tạo camera|đang căn chỉnh khuôn mặt/i })).toBeInTheDocument();
    expect(await screen.findByText(/vui lòng giữ khuôn mặt trong vùng quét|giữ khuôn mặt trong vùng oval và nhìn theo hướng dẫn/i)).toBeInTheDocument();
    expect(await screen.findByText(/kết nối camera/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /quản lý ảnh tĩnh/i })).toBeInTheDocument();
  });

});
