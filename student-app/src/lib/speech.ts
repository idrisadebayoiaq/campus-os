import * as Speech from "expo-speech";

type SpeakOptions = {
  rate?: number;
  onStart?: () => void;
  onDone?: () => void;
  onError?: (message: string) => void;
};

let speakingId = 0;

/** Reads text aloud with the phone's text-to-speech engine. */
export async function speakText(text: string, rateOrOptions: number | SpeakOptions = 1) {
  const opts: SpeakOptions = typeof rateOrOptions === "number" ? { rate: rateOrOptions } : rateOrOptions;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return false;
  const id = ++speakingId;
  try {
    if (await Speech.isSpeakingAsync()) {
      await Speech.stop();
      // Android drops an utterance queued in the same tick as stop().
      await new Promise((r) => setTimeout(r, 150));
    }
    if (id !== speakingId) return false;
    Speech.speak(clean.slice(0, 3900), {
      rate: opts.rate ?? 1,
      pitch: 1,
      onStart: opts.onStart,
      onDone: opts.onDone,
      onStopped: opts.onDone,
      onError: (e) => {
        opts.onDone?.();
        opts.onError?.(e?.message || "Voice isn't available on this phone.");
      },
    });
    return true;
  } catch (e) {
    opts.onError?.(e instanceof Error ? e.message : "Voice isn't available on this phone.");
    return false;
  }
}

export function stopSpeaking() {
  speakingId++;
  void Speech.stop().catch(() => undefined);
}
