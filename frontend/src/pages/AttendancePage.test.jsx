import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { listAttendance } from "../lib/attendanceApi";
import { renderApp } from "../test/test-utils";

vi.mock("../lib/attendanceApi", () => ({
  listAttendance: vi.fn(),
}));

function stubFetch(...responses) {
  const fetchMock = vi.fn();
  responses.forEach((response) => {
    fetchMock.mockResolvedValueOnce(response);
  });
  vi.stubGlobal("fetch", fetchMock);
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AttendancePage", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads attendance rows and employee-based filter options", async () => {
    stubFetch(
      jsonResponse({ manager: { id: 1, username: "manager" } }),
      jsonResponse({
        employees: [{ id: 1, employee_code: "EMP-001", full_name: "Nguyễn Văn A", department: "Kỹ thuật", position: "Kỹ sư", is_active: true }],
      }),
    );

    listAttendance.mockResolvedValueOnce({
      records: [
        {
          id: 1,
          employee_id: 1,
          employee_code: "EMP-001",
          full_name: "Nguyễn Văn A",
          department: "Kỹ thuật",
          position: "Kỹ sư",
          checked_in_at: "2026-04-03T08:15:00+07:00",
          snapshot_url: "/api/manager/attendance/1/snapshot",
        },
      ],
    });

    renderApp("/manager/attendance");

    expect(await screen.findByText("EMP-001")).toBeInTheDocument();
    const row = screen.getByText("EMP-001").closest("tr");
    expect(within(row).getByText("Kỹ thuật")).toBeInTheDocument();
    expect(within(row).getByText("Kỹ sư")).toBeInTheDocument();
    expect(within(row).getByText("Đúng giờ")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Kỹ thuật" })).toBeInTheDocument();
  });

  it("sends department and position filters to the attendance API", async () => {
    stubFetch(
      jsonResponse({ manager: { id: 1, username: "manager" } }),
      jsonResponse({
        employees: [
          { id: 1, employee_code: "EMP-001", full_name: "Nguyễn Văn A", department: "Kỹ thuật", position: "Kỹ sư", is_active: true },
          { id: 2, employee_code: "EMP-002", full_name: "Trần Thị B", department: "Kinh doanh", position: "Trưởng nhóm", is_active: true },
        ],
      }),
    );

    listAttendance
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({
        records: [
          {
            id: 2,
            employee_id: 2,
            employee_code: "EMP-002",
            full_name: "Trần Thị B",
            department: "Kinh doanh",
            position: "Trưởng nhóm",
            checked_in_at: "2026-04-03T09:15:00+07:00",
            snapshot_url: "/api/manager/attendance/2/snapshot",
          },
        ],
      });

    renderApp("/manager/attendance");

    await waitFor(() => expect(listAttendance).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Phòng ban"), { target: { value: "Kinh doanh" } });
    fireEvent.change(screen.getByLabelText("Chức vụ"), { target: { value: "Trưởng nhóm" } });

    await waitFor(() => expect(listAttendance).toHaveBeenCalledTimes(3));
    expect(listAttendance).toHaveBeenLastCalledWith(expect.objectContaining({ department: "Kinh doanh", position: "Trưởng nhóm" }));
    expect(await screen.findByText("EMP-002")).toBeInTheDocument();
  });

  it("renders empty state when there are no matching records", async () => {
    stubFetch(jsonResponse({ manager: { id: 1, username: "manager" } }), jsonResponse({ employees: [] }));
    listAttendance.mockResolvedValueOnce({ records: [] });

    renderApp("/manager/attendance");

    expect(await screen.findByText("Không có bản ghi phù hợp")).toBeInTheDocument();
  });
});
