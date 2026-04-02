import { describe, expect, it, vi } from "vitest";

import { apiRequest } from "./api";

describe("apiRequest", () => {
  it("surfaces a readable message for non-json error bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("Internal server error", {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );

    await expect(apiRequest("/api/test")).rejects.toMatchObject({
      status: 500,
      message: "Internal server error",
    });
  });
});
