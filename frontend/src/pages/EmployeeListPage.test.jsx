import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderApp } from "../test/test-utils";

function mockJsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockDashboardResponse() {
  return mockJsonResponse({ employee_stats: [] });
}

describe("Employee roster", () => {
  beforeEach(() => {
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders employees and supports creating a new employee", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockJsonResponse({ manager: { id: 1, username: "manager" } }))
      .mockResolvedValueOnce(
        mockJsonResponse({
          employees: [{ id: 1, employee_code: "EMP-001", full_name: "Ada", department: "Kỹ thuật", position: "Kỹ sư", is_active: true }],
        }),
      )
      .mockResolvedValueOnce(mockDashboardResponse())
      .mockResolvedValueOnce(mockJsonResponse({ employee: { id: 2, employee_code: "EMP-002", full_name: "Grace", department: "Nhân sự", position: "Chuyên viên", is_active: true } }, 201))
      .mockResolvedValueOnce(
        mockJsonResponse({
          employees: [
            { id: 1, employee_code: "EMP-001", full_name: "Ada", department: "Kỹ thuật", position: "Kỹ sư", is_active: true },
            { id: 2, employee_code: "EMP-002", full_name: "Grace", department: "Nhân sự", position: "Chuyên viên", is_active: true },
          ],
        }),
      )
      .mockResolvedValueOnce(mockDashboardResponse());
    vi.stubGlobal("fetch", fetchMock);

    renderApp("/manager/employees");

    expect(await screen.findByText("EMP-001")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/mã nhân viên/i), "EMP-002");
    await user.type(screen.getByLabelText(/họ và tên/i), "Grace");
    await user.type(screen.getByLabelText(/chức vụ/i), "Chuyên viên");
    await user.type(screen.getByLabelText(/phòng ban/i), "Nhân sự");
    await user.click(screen.getByRole("button", { name: /tạo nhân viên/i }));

    expect(await screen.findByText("EMP-002")).toBeInTheDocument();
    const graceRow = screen.getByText("EMP-002").closest("tr");
    expect(within(graceRow).getByText("Nhân sự")).toBeInTheDocument();
  });

  it("supports inline employee edits including department and position", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockJsonResponse({ manager: { id: 1, username: "manager" } }))
      .mockResolvedValueOnce(
        mockJsonResponse({
          employees: [{ id: 1, employee_code: "EMP-001", full_name: "Ada", department: "Kỹ thuật", position: "Kỹ sư", is_active: true }],
        }),
      )
      .mockResolvedValueOnce(mockDashboardResponse())
      .mockResolvedValueOnce(
        mockJsonResponse({
          employee: { id: 1, employee_code: "EMP-001A", full_name: "Ada Lovelace", department: "R&D", position: "Lead Engineer", is_active: true },
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          employees: [{ id: 1, employee_code: "EMP-001A", full_name: "Ada Lovelace", department: "R&D", position: "Lead Engineer", is_active: true }],
        }),
      )
      .mockResolvedValueOnce(mockDashboardResponse());
    vi.stubGlobal("fetch", fetchMock);

    renderApp("/manager/employees");

    expect(await screen.findByText("EMP-001")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sửa" }));
    await user.clear(screen.getByLabelText(/họ và tên emp-001/i));
    await user.type(screen.getByLabelText(/họ và tên emp-001/i), "Ada Lovelace");
    await user.clear(screen.getByLabelText(/mã nhân viên emp-001/i));
    await user.type(screen.getByLabelText(/mã nhân viên emp-001/i), "EMP-001A");
    await user.clear(screen.getByLabelText(/phòng ban emp-001/i));
    await user.type(screen.getByLabelText(/phòng ban emp-001/i), "R&D");
    await user.clear(screen.getByLabelText(/chức vụ emp-001/i));
    await user.type(screen.getByLabelText(/chức vụ emp-001/i), "Lead Engineer");
    await user.click(screen.getByRole("button", { name: "Lưu" }));

    expect(await screen.findByText("EMP-001A")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    const updatedRow = screen.getByText("EMP-001A").closest("tr");
    expect(within(updatedRow).getByText("R&D")).toBeInTheDocument();
  });

  it("soft deletes employees from the active list", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockJsonResponse({ manager: { id: 1, username: "manager" } }))
      .mockResolvedValueOnce(
        mockJsonResponse({
          employees: [{ id: 1, employee_code: "EMP-001", full_name: "Ada", department: "Kỹ thuật", position: "Kỹ sư", is_active: true }],
        }),
      )
      .mockResolvedValueOnce(mockDashboardResponse())
      .mockResolvedValueOnce(mockJsonResponse({ status: "deleted", employee_id: 1, deactivated: true, deleted_face_samples: 1 }))
      .mockResolvedValueOnce(
        mockJsonResponse({
          employees: [{ id: 1, employee_code: "EMP-001", full_name: "Ada", department: "Kỹ thuật", position: "Kỹ sư", is_active: false }],
        }),
      )
      .mockResolvedValueOnce(mockDashboardResponse());
    vi.stubGlobal("fetch", fetchMock);

    renderApp("/manager/employees");

    expect(await screen.findByText("EMP-001")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Xóa" }));

    expect(await screen.findByText(/đã xóa nhân viên/i)).toBeInTheDocument();
    expect(screen.queryByText("EMP-001")).not.toBeInTheDocument();
  });
});
