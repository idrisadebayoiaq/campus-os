/** Optional expo-speech wrapper — no-ops if the native module isn't installed yet. */

type SpeechModule = {
  speak: (text: string, options?: { rate?: number }) => void;
  stop: () => void;
};

function getSpeech(): SpeechModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-speech") as SpeechModule | undefined;
    if (!mod || typeof mod.speak !== "function") return null;
    return mod;
  } catch {
    return null;
  }
}

export function speakText(text: string, rate = 0.95) {
  const speech = getSpeech();
  if (!speech) return false;
  try {
    speech.stop();
    speech.speak(text, { rate });
    return true;
  } catch {
    return false;
  }
}

export function stopSpeaking() {
  const speech = getSpeech();
  try {
    speech?.stop();
  } catch {
    /* ignore */
  }
}
