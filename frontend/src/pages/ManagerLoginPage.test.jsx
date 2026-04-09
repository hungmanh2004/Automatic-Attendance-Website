import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderApp } from "../test/test-utils";

describe("Manager login", () => {
  it("submits credentials and navigates on success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "unauthorized" }), {
          status: 401,
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
      );
    vi.stubGlobal("fetch", fetchMock);

    renderApp("/manager/login");

    await user.type(screen.getByLabelText(/tên đăng nhập/i), "manager");
    await user.type(screen.getByLabelText(/mật khẩu/i), "secret123");
    await user.click(screen.getByRole("button", { name: /đăng nhập quản trị/i }));

    expect(await screen.findByRole("heading", { name: /điều phối chấm công doanh nghiệp theo thời gian thực/i })).toBeInTheDocument();
  });

  it("shows an error when login fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: "invalid_credentials" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }),
        ),
    );

    renderApp("/manager/login");

    await user.type(screen.getByLabelText(/tên đăng nhập/i), "manager");
    await user.type(screen.getByLabelText(/mật khẩu/i), "wrong");
    await user.click(screen.getByRole("button", { name: /đăng nhập quản trị/i }));

    expect(await screen.findByText(/tên đăng nhập hoặc mật khẩu không đúng/i)).toBeInTheDocument();
  });

  it("does not show an auth error on the first visit to the login page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    renderApp("/manager/login");

    expect(await screen.findByRole("heading", { name: /đăng nhập quản trị/i })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
