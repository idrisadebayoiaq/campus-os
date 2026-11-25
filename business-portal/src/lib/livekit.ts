/**
 * LiveKit helpers. Set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET in env.
 */

export type LiveSessionMode = "video" | "voice";

export function isLiveKitConfigured() {
  return Boolean(
    process.env.LIVEKIT_URL &&
      process.env.LIVEKIT_API_KEY &&
      process.env.LIVEKIT_API_SECRET,
  );
}

export function liveKitStatusMessage() {
  return isLiveKitConfigured()
    ? "LiveKit is configured."
    : "LiveKit API keys not set yet — sessions are scheduled and ready to connect once keys are provided.";
}

export function buildLiveRoomName(classId: string) {
  return `campusos-${classId.replace(/-/g, "").slice(0, 12)}-${Date.now()}`;
}

export function publicLiveKitUrl() {
  return process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL || "";
}

/** Student-facing join page (token minted separately). */
export function buildStudentJoinPath(roomName: string) {
  const base =
    process.env.NEXT_PUBLIC_STUDENT_WEB_URL ||
    process.env.STUDENT_WEB_URL ||
    "https://campusos-app.vercel.app";
  return `${base.replace(/\/$/, "")}/live/${encodeURIComponent(roomName)}`;
}
