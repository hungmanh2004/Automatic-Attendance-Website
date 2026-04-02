const MESSAGES = {
  invalid_credentials: "Incorrect username or password.",
  duplicate_employee_code: "That employee code is already in use.",
  face_registration_exists: "This employee already has face registration. Delete it first to enroll again.",
  no_face: "One of the uploaded images did not contain a detectable face. Please try clearer photos.",
  multiple_faces: "One of the uploaded images contains more than one face. Please upload photos with exactly one face each.",
  invalid_request: "Please check the form inputs and try again.",
};

export function getFriendlyErrorMessage(error, fallback = "Something went wrong. Please try again.") {
  const rawStatus = error?.payload?.status;
  if (rawStatus && MESSAGES[rawStatus]) {
    return MESSAGES[rawStatus];
  }

  if (typeof error?.payload?.message === "string" && error.payload.message.trim()) {
    return error.payload.message;
  }

  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message;
  }

  return fallback;
}
