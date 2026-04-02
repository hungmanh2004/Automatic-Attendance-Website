import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderApp } from "../test/test-utils";

describe("Employee face management", () => {
  it("loads current samples", async () => {
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
          new Response(JSON.stringify({ employee: { id: 1, employee_code: "EMP-001", full_name: "Ada", is_active: true }, face_samples: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
    );

    renderApp("/manager/employees/1/faces");

    expect(await screen.findByText(/employee face management/i)).toBeInTheDocument();
  });

  it("requires exactly five files before enrollment", async () => {
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
          new Response(JSON.stringify({ employee: { id: 1, employee_code: "EMP-001", full_name: "Ada", is_active: true }, face_samples: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
    );

    renderApp("/manager/employees/1/faces");

    const fileInput = await screen.findByLabelText(/face images/i);
    await user.upload(fileInput, [new File(["1"], "1.jpg", { type: "image/jpeg" })]);
    await user.click(screen.getByRole("button", { name: /enroll faces/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/exactly 5/i);
  });

  it("shows a friendly backend error when one uploaded image has no face", async () => {
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
          new Response(JSON.stringify({ employee: { id: 1, employee_code: "EMP-001", full_name: "Ada", is_active: true }, face_samples: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: "no_face", image_index: 3 }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }),
        ),
    );

    renderApp("/manager/employees/1/faces");

    const fileInput = await screen.findByLabelText(/face images/i);
    await user.upload(fileInput, [
      new File(["1"], "1.jpg", { type: "image/jpeg" }),
      new File(["2"], "2.jpg", { type: "image/jpeg" }),
      new File(["3"], "3.jpg", { type: "image/jpeg" }),
      new File(["4"], "4.jpg", { type: "image/jpeg" }),
      new File(["5"], "5.jpg", { type: "image/jpeg" }),
    ]);
    await user.click(screen.getByRole("button", { name: /enroll faces/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/did not contain a detectable face/i);
  });

  it("submits enrollment and refreshes samples", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ manager: { id: 1, username: "manager" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ employee: { id: 1, employee_code: "EMP-001", full_name: "Ada", is_active: true }, face_samples: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ employee: { id: 1, employee_code: "EMP-001", full_name: "Ada", is_active: true }, face_samples: [{ id: 1, sample_index: 1, image_path: "/tmp/1.jpg", created_at: "2026-04-02T12:00:00" }], face_sample_count: 1 }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ employee: { id: 1, employee_code: "EMP-001", full_name: "Ada", is_active: true }, face_samples: [{ id: 1, sample_index: 1, image_path: "/tmp/1.jpg", created_at: "2026-04-02T12:00:00" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderApp("/manager/employees/1/faces");

    const fileInput = await screen.findByLabelText(/face images/i);
    await user.upload(fileInput, [
      new File(["1"], "1.jpg", { type: "image/jpeg" }),
      new File(["2"], "2.jpg", { type: "image/jpeg" }),
      new File(["3"], "3.jpg", { type: "image/jpeg" }),
      new File(["4"], "4.jpg", { type: "image/jpeg" }),
      new File(["5"], "5.jpg", { type: "image/jpeg" }),
    ]);
    await user.click(screen.getByRole("button", { name: /enroll faces/i }));

    expect(await screen.findByText(/sample 1/i)).toBeInTheDocument();
  });

  it("deletes face registration", async () => {
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
          new Response(JSON.stringify({ employee: { id: 1, employee_code: "EMP-001", full_name: "Ada", is_active: true }, face_samples: [{ id: 1, sample_index: 1, image_path: "/tmp/1.jpg", created_at: "2026-04-02T12:00:00" }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ employee_id: 1, deleted_count: 1 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ employee: { id: 1, employee_code: "EMP-001", full_name: "Ada", is_active: true }, face_samples: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
    );

    renderApp("/manager/employees/1/faces");

    expect(await screen.findByText(/sample 1/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /delete face registration/i }));

    expect(await screen.findByText(/no face samples registered/i)).toBeInTheDocument();
  });
});
