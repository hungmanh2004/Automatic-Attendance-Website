import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import { renderApp } from "./test/test-utils";

vi.mock("./lib/attendanceApi", () => ({
  listAttendance: vi.fn().mockResolvedValue({ records: [] }),
}));

describe("attendance route", () => {
  it("renders the manager attendance page under the protected route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ manager: { id: 1, username: "manager" } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ employees: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
    );

    renderApp("/manager/attendance");

    expect(await screen.findByRole("heading", { name: /lịch sử chấm công với bộ lọc theo thời gian/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /chấm công/i })).toBeInTheDocument();
  });

  it("redirects unauthenticated attendance access to manager login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    renderApp("/manager/attendance");

    expect(await screen.findByRole("heading", { name: /đăng nhập quản trị/i })).toBeInTheDocument();
  });
});
