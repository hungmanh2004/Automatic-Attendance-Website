import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import ManagerLayout from "./ManagerLayout";

const logoutMock = vi.fn();

vi.mock("../context/ManagerAuthContext", () => ({
  useManagerAuth: () => ({
    manager: { username: "admin" },
    logout: logoutMock,
  }),
}));

describe("ManagerLayout", () => {
  it("redirects to the guest home page after logout", async () => {
    logoutMock.mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={["/manager/dashboard"]}>
        <Routes>
          <Route path="/" element={<div>Trang quét khuôn mặt</div>} />
          <Route path="/manager" element={<ManagerLayout />}>
            <Route path="dashboard" element={<div>Dashboard</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    await userEvent.setup().click(screen.getByRole("button", { name: /đăng xuất/i }));

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Trang quét khuôn mặt")).toBeInTheDocument();
  });
});
