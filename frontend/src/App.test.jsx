import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderApp } from "./test/test-utils";

describe("App routes", () => {
  it("shows landing navigation choices", () => {
    renderApp("/");

    expect(screen.getByRole("link", { name: /manager/i })).toHaveAttribute("href", "/manager/login");
    expect(screen.getByRole("link", { name: /guest/i })).toHaveAttribute("href", "/guest");
  });

  it("renders the guest placeholder page", () => {
    renderApp("/guest");

    expect(screen.getByText(/guest camera check-in is coming next/i)).toBeInTheDocument();
  });

  it("redirects unauthenticated manager routes to login", async () => {
    const user = userEvent.setup();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    renderApp("/manager/employees");

    expect(await screen.findByRole("heading", { name: /sign in to manage employees/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /sign in/i }));
  });

  it("restores an existing manager session when entering manager routes from a public page", async () => {
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

    renderApp("/");

    await user.click(screen.getByRole("link", { name: /manager/i }));

    expect(await screen.findByText(/roster management/i)).toBeInTheDocument();
  });
});
