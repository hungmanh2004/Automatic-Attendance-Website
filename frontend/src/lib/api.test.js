import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiRequest, enrollEmployeeFacesBatch } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("builds multipart batch payloads from captured frame objects", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const frames = Array.from({ length: 8 }, (_, index) => ({
      blob: new Blob([`frame-${index}`], { type: "image/jpeg" }),
      capturedAtMs: index * 325,
      detectorScore: 0.72 + index * 0.001,
      blurScore: 28 + index,
      hintPose: index % 2 === 0 ? "left" : "right",
    }));

    await enrollEmployeeFacesBatch(5, frames);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, options] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/manager/employees/5/face-enrollment/batch");
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.getAll("frames")).toHaveLength(8);

    const metadata = JSON.parse(options.body.get("metadata"));
    expect(metadata.source).toBe("scanner_capture");
    expect(metadata.capture_mode).toBe("goal_based");
    expect(metadata.frames[0]).toMatchObject({
      index: 0,
      timestamp_ms: 0,
      detector_score: frames[0].detectorScore,
      blur_score: frames[0].blurScore,
      hint_pose: frames[0].hintPose,
    });
  });

  it("rejects client-side when fewer than 8 frame objects are provided", async () => {
    expect(() =>
      enrollEmployeeFacesBatch(
        5,
        Array.from({ length: 7 }, (_, index) => ({
          blob: new Blob([`frame-${index}`], { type: "image/jpeg" }),
          capturedAtMs: index * 300,
          detectorScore: 0.8,
          blurScore: 30,
          hintPose: "front",
        })),
      ),
    ).toThrow(ApiError);
  });
});
