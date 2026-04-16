import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

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

describe("ReportsPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders only Excel export actions after data loads", async () => {
    stubFetch(
      jsonResponse({ manager: { id: 1, username: "manager" } }),
      jsonResponse({
        summary: {
          total_employees: 12,
          checked_in_today: 9,
          attendance_rate: 75,
          failed_scans_today: 1,
        },
      }),
    );

    listAttendance.mockResolvedValueOnce({
      records: [
        {
          id: 1,
          employee_id: 1,
          employee_code: "EMP-001",
          full_name: "Nguyễn Văn A",
          checked_in_at: "2026-04-03T08:15:00+07:00",
          snapshot_url: "/api/manager/attendance/1/snapshot",
        },
      ],
    });

    renderApp("/manager/reports");

    expect(await screen.findByRole("button", { name: "Tải lịch sử Excel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tải tổng hợp KPI Excel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tải lịch sử CSV" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tải tổng hợp KPI CSV" })).not.toBeInTheDocument();
  });
});
