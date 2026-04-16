const DEFAULT_CAMERA_CONSTRAINTS = {
  audio: false,
  video: {
    facingMode: "user",
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
};

function getLandmarkPoint(landmarks, candidates) {
  return candidates
    .map((candidate) =>
      landmarks.find((landmark) => landmark.type?.toLowerCase() === candidate.toLowerCase()),
    )
    .find(Boolean);
}

export async function startCamera(videoElement, constraints = DEFAULT_CAMERA_CONSTRAINTS) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Browser does not support camera access.");
  }

  const stream = await navigator.mediaDevices.getUserMedia(constraints);

  if (videoElement) {
    videoElement.srcObject = stream;
    try {
      await videoElement.play();
    } catch {
      // Ignore autoplay rejections; the assigned stream can still render.
    }
  }

  return stream;
}

export function stopCamera(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

export async function createFaceDetector() {
  if (typeof window === "undefined" || !("FaceDetector" in window)) {
    return null;
  }

  try {
    return new window.FaceDetector({
      fastMode: true,
      maxDetectedFaces: 2,
    });
  } catch {
    return null;
  }
}

export async function detectFaces(detector, videoElement) {
  if (!detector || !videoElement || videoElement.readyState < 2) {
    return [];
  }

  try {
    return await detector.detect(videoElement);
  } catch {
    return [];
  }
}

export function captureFrame(videoElement) {
  if (!videoElement?.videoWidth || !videoElement?.videoHeight) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  const context = canvas.getContext("2d");

  context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL("image/jpeg", 0.92);
}

export function analyzeDetectedFace(face, frameWidth, frameHeight) {
  if (!face || !frameWidth || !frameHeight) {
    return {
      isCentered: false,
      isInsideGuide: false,
      isSingleFace: false,
      isTooFar: true,
      pose: "unknown",
      yaw: 0,
      pitch: 0,
      confidence: 0,
      boundingBox: null,
    };
  }

  const boundingBox = face.boundingBox || {
    x: 0,
    y: 0,
    width: frameWidth,
    height: frameHeight,
  };

  const centerX = boundingBox.x + boundingBox.width / 2;
  const centerY = boundingBox.y + boundingBox.height / 2;
  const normalizedX = centerX / frameWidth;
  const normalizedY = centerY / frameHeight;
  const widthRatio = boundingBox.width / frameWidth;
  const heightRatio = boundingBox.height / frameHeight;
  const landmarks = face.landmarks || [];

  const leftEye = getLandmarkPoint(landmarks, ["leftEye", "eyeLeft"]);
  const rightEye = getLandmarkPoint(landmarks, ["rightEye", "eyeRight"]);
  const nose = getLandmarkPoint(landmarks, ["noseTip", "nose"]);
  const mouth = getLandmarkPoint(landmarks, ["mouth", "mouthCenter", "mouthLeft", "mouthRight"]);

  let yaw = 0;
  let pitch = 0;
  let confidence = 0.55;

  if (leftEye && rightEye && nose) {
    const eyeMidX = (leftEye.x + rightEye.x) / 2;
    const eyeMidY = (leftEye.y + rightEye.y) / 2;
    const eyeDistance = Math.max(Math.abs(rightEye.x - leftEye.x), 1);
    yaw = ((nose.x - eyeMidX) / eyeDistance) * 1.8;

    if (mouth) {
      const faceHeight = Math.max(mouth.y - eyeMidY, 1);
      pitch = ((nose.y - eyeMidY) / faceHeight - 0.48) * 4.2;
      confidence = 0.88;
    } else {
      confidence = 0.72;
    }
  }

  let pose = "front";
  if (yaw <= -0.18) pose = "left";
  else if (yaw >= 0.18) pose = "right";
  else if (pitch <= -0.14) pose = "up";
  else if (pitch >= 0.16) pose = "down";

  return {
    boundingBox,
    centerX,
    centerY,
    confidence,
    heightRatio,
    isCentered: Math.abs(normalizedX - 0.5) < 0.11 && Math.abs(normalizedY - 0.47) < 0.14,
    isInsideGuide:
      normalizedX > 0.24 &&
      normalizedX < 0.76 &&
      normalizedY > 0.14 &&
      normalizedY < 0.82,
    isSingleFace: true,
    isTooFar: widthRatio < 0.2 || heightRatio < 0.32,
    pitch,
    pose,
    widthRatio,
    yaw,
  };
}

export function isPoseMatching(expectedPose, detectedPose) {
  if (expectedPose === "straight") {
    return detectedPose === "front";
  }

  return expectedPose === detectedPose;
}
