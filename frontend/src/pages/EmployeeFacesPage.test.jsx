import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderApp } from "../test/test-utils";

function mockJsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Employee face management", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads current samples with image slots", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(mockJsonResponse({ manager: { id: 1, username: "manager" } }))
        .mockResolvedValueOnce(
          mockJsonResponse({
            employee: { id: 1, employee_code: "EMP-001", full_name: "Ada", is_active: true },
            face_samples: [
              {
                id: 1,
                employee_id: 1,
                sample_index: 1,
                image_path: "/tmp/1.jpg",
                image_url: "/api/manager/employees/1/face-samples/1/image",
                created_at: "2026-04-02T12:00:00",
              },
            ],
          }),
        ),
    );

    renderApp("/manager/employees/1/faces");

    expect(await screen.findByText(/quản lý bộ 5 ảnh khuôn mặt ai/i)).toBeInTheDocument();
    expect(await screen.findByText(/emp-001/i)).toBeInTheDocument();
    expect(await screen.findByAltText("Mẫu 1")).toBeInTheDocument();
  });

  it("requires exactly five files before enrollment", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(mockJsonResponse({ manager: { id: 1, username: "manager" } }))
        .mockResolvedValueOnce(mockJsonResponse({ employee: { id: 1, employee_code: "EMP-001", full_name: "Ada", is_active: true }, face_samples: [] })),
    );

    renderApp("/manager/employees/1/faces");

    const fileInput = await screen.findByLabelText(/ảnh khuôn mặt/i);
    await user.upload(fileInput, [new File(["1"], "1.jpg", { type: "image/jpeg" })]);
    await user.click(screen.getByRole("button", { name: /đăng ký khuôn mặt/i }));

    expect(await screen.findByText(/cần chọn đúng 5 ảnh khuôn mặt/i)).toBeInTheDocument();
  });

  it("replaces a single sample slot", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockJsonResponse({ manager: { id: 1, username: "manager" } }))
      .mockResolvedValueOnce(
        mockJsonResponse({
          employee: { id: 1, employee_code: "EMP-001", full_name: "Ada", is_active: true },
          face_samples: [
            {
              id: 1,
              employee_id: 1,
              sample_index: 1,
              image_path: "/tmp/1.jpg",
              image_url: "/api/manager/employees/1/face-samples/1/image",
              created_at: "2026-04-02T12:00:00",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "updated",
          employee: { id: 1, employee_code: "EMP-001", full_name: "Ada", is_active: true },
          face_sample: {
            id: 1,
            employee_id: 1,
            sample_index: 1,
            image_path: "/tmp/1.jpg",
            image_url: "/api/manager/employees/1/face-samples/1/image",
            created_at: "2026-04-02T12:30:00",
          },
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          employee: { id: 1, employee_code: "EMP-001", full_name: "Ada", is_active: true },
          face_samples: [
            {
              id: 1,
              employee_id: 1,
              sample_index: 1,
              image_path: "/tmp/1.jpg",
              image_url: "/api/manager/employees/1/face-samples/1/image",
              created_at: "2026-04-02T12:30:00",
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderApp("/manager/employees/1/faces");

    const replaceInputs = await screen.findAllByLabelText(/sửa ảnh này/i);
    await user.upload(replaceInputs[0], new File(["updated"], "1.jpg", { type: "image/jpeg" }));

    expect(await screen.findByText(/đã cập nhật ảnh mẫu 1/i)).toBeInTheDocument();
  });
});
