import { describe, expect, it } from "vitest";

import {
  buildCaptureFeedback,
  computeBlurScore,
  DEFAULT_CAPTURE_CONFIG,
  evaluateFrameQuality,
  mirrorHintPose,
  normalizeCaptureConfig,
  shouldExtendCaptureAfterBatchError,
} from "./faceRegistrationCapture";

function createDetection({
  x1 = 470,
  y1 = 180,
  x2 = 790,
  y2 = 560,
  score = 0.9,
  keypoints,
} = {}) {
  return {
    box: { x1, y1, x2, y2 },
    score,
    keypoints: keypoints || [
      [560, 280],
      [690, 282],
      [630, 355],
      [585, 450],
      [680, 448],
    ],
  };
}

describe("faceRegistrationCapture", () => {
  it("uses faster capture defaults for batch enrollment", () => {
    expect(DEFAULT_CAPTURE_CONFIG).toEqual({
      minFrames: 8,
      maxFrames: 12,
      thumbnailLimit: 10,
      minCaptureGapMs: 300,
    });
    expect(normalizeCaptureConfig({})).toEqual({
      minFrames: 8,
      maxFrames: 12,
      thumbnailLimit: 10,
      minCaptureGapMs: 300,
    });
  });

  it("normalizes capture config from backend shape", () => {
    expect(normalizeCaptureConfig({
      min_frames: 8,
      max_frames: 12,
      thumbnail_limit: 10,
      min_capture_gap_ms: 300,
    })).toEqual({
      minFrames: 8,
      maxFrames: 12,
      thumbnailLimit: 10,
      minCaptureGapMs: 300,
    });
  });

  it("rejects batches with no face or multiple faces before capture", () => {
    expect(evaluateFrameQuality({
      detections: [],
      videoWidth: 1280,
      videoHeight: 720,
      nowMs: 1000,
      lastAcceptedAtMs: Number.NaN,
      blurScore: 100,
    }).reason).toBe("no_face");

    expect(evaluateFrameQuality({
      detections: [createDetection(), createDetection({ x1: 150, x2: 320 })],
      videoWidth: 1280,
      videoHeight: 720,
      nowMs: 1000,
      lastAcceptedAtMs: Number.NaN,
      blurScore: 100,
    }).reason).toBe("multiple_faces");
  });

  it("rejects low-confidence, off-guide, blurry, and overly fast captures", () => {
    expect(evaluateFrameQuality({
      detections: [createDetection({ score: 0.5 })],
      videoWidth: 1280,
      videoHeight: 720,
      nowMs: 1000,
      lastAcceptedAtMs: Number.NaN,
      blurScore: 100,
    }).reason).toBe("low_confidence");

    expect(evaluateFrameQuality({
      detections: [createDetection({ x1: 50, y1: 40, x2: 260, y2: 300 })],
      videoWidth: 1280,
      videoHeight: 720,
      nowMs: 1000,
      lastAcceptedAtMs: Number.NaN,
      blurScore: 100,
    }).reason).toBe("off_guide");

    expect(evaluateFrameQuality({
      detections: [createDetection()],
      videoWidth: 1280,
      videoHeight: 720,
      nowMs: 1000,
      lastAcceptedAtMs: Number.NaN,
      blurScore: 3,
    }).reason).toBe("blurry");

    expect(evaluateFrameQuality({
      detections: [createDetection()],
      videoWidth: 1280,
      videoHeight: 720,
      nowMs: 1200,
      lastAcceptedAtMs: 800,
      blurScore: 100,
      config: { min_capture_gap_ms: 700 },
    }).reason).toBe("capture_gap");
  });

  it("accepts a centered, sharp single face and builds success feedback", () => {
    const decision = evaluateFrameQuality({
      detections: [createDetection()],
      videoWidth: 1280,
      videoHeight: 720,
      nowMs: 2000,
      lastAcceptedAtMs: 1000,
      blurScore: 120,
      config: { min_capture_gap_ms: 700 },
    });

    expect(decision).toMatchObject({
      accepted: true,
      reason: "accepted",
    });
    expect(buildCaptureFeedback("accepted", { acceptedCount: 8, targetCount: 20 })).toMatchObject({
      tone: "success",
      label: "Đã nhận khung hình #8",
    });
  });

  it("mirrors left-right pose hints for mirrored uploads", () => {
    expect(mirrorHintPose("left")).toBe("right");
    expect(mirrorHintPose("right")).toBe("left");
    expect(mirrorHintPose("front")).toBe("front");
  });

  it("asks to extend collection when backend still needs more valid frames", () => {
    expect(shouldExtendCaptureAfterBatchError(
      { payload: { status: "insufficient_valid_frames" } },
      { acceptedCount: 20, currentTargetCount: 20, maxFrames: 30 },
    )).toBe(true);

    expect(shouldExtendCaptureAfterBatchError(
      { payload: { status: "face_registration_exists" } },
      { acceptedCount: 20, currentTargetCount: 20, maxFrames: 30 },
    )).toBe(false);

    expect(buildCaptureFeedback("needs_more_frames", { acceptedCount: 20, targetCount: 30 })).toMatchObject({
      tone: "warning",
      label: "Cần thêm góc nhìn",
    });
  });

  it("produces a higher blur score for a sharp image than a flat one", () => {
    const sharp = {
      width: 4,
      height: 4,
      data: new Uint8ClampedArray([
        0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255,
        255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255,
        0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255,
        255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255,
      ]),
    };
    const flat = {
      width: 4,
      height: 4,
      data: new Uint8ClampedArray(Array.from({ length: 64 }, (_, index) => index % 4 === 3 ? 255 : 140)),
    };

    expect(computeBlurScore(sharp)).toBeGreaterThan(computeBlurScore(flat));
  });
});
