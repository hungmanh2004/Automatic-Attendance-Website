import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderApp } from "../test/test-utils";

describe("Employee roster", () => {
  it("renders employees and supports creating a new employee", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ manager: { id: 1, username: "manager" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ employees: [{ id: 1, employee_code: "EMP-001", full_name: "Ada", is_active: true }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ employee: { id: 2, employee_code: "EMP-002", full_name: "Grace", is_active: true } }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ employees: [{ id: 1, employee_code: "EMP-001", full_name: "Ada", is_active: true }, { id: 2, employee_code: "EMP-002", full_name: "Grace", is_active: true }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderApp("/manager/employees");

    expect(await screen.findByText("EMP-001")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/employee code/i), "EMP-002");
    await user.type(screen.getByLabelText(/full name/i), "Grace");
    await user.click(screen.getByRole("button", { name: /create employee/i }));

    expect(await screen.findByText("EMP-002")).toBeInTheDocument();
  });

  it("shows a duplicate employee code error", async () => {
    const user = userEvent.setup();
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
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: "duplicate_employee_code" }), {
            status: 409,
            headers: { "Content-Type": "application/json" },
          }),
        ),
    );

    renderApp("/manager/employees");

    await screen.findByText(/roster management/i);

    await user.type(screen.getByLabelText(/employee code/i), "EMP-001");
    await user.type(screen.getByLabelText(/full name/i), "Ada");
    await user.click(screen.getByRole("button", { name: /create employee/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/already in use/i);
  });
});
