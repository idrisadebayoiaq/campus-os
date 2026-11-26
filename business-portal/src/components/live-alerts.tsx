"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Alert = { id: string; title: string; body: string | null; link: string | null };

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const tone = (freq: number, start: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + 0.25);
    };
    tone(880, 0);
    tone(1175, 0.18);
    setTimeout(() => void ctx.close(), 800);
  } catch {
    // Browsers can block audio until the user has interacted with the page.
  }
}

/** Live alerts for new orders, enquiries, viewings and more: toast, sound and browser notification. */
export function LiveAlerts({ userId }: { userId: string }) {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);

  useEffect(() => {
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    const saved = window.localStorage.getItem("campusos-alert-muted") === "1";
    setMuted(saved);
    mutedRef.current = saved;
  }, []);

  const dismiss = useCallback((id: string) => setAlerts((a) => a.filter((x) => x.id !== id)), []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`alerts-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as { id: string; title: string; body: string | null; link: string | null };
          setAlerts((a) => [...a.slice(-3), { id: row.id, title: row.title, body: row.body, link: row.link }]);
          setTimeout(() => dismiss(row.id), 9000);
          if (!mutedRef.current) beep();
          if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
            new Notification(row.title, { body: row.body ?? undefined });
          }
          router.refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, router, dismiss]);

  async function enable() {
    if (typeof Notification === "undefined") return;
    setPermission(await Notification.requestPermission());
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    window.localStorage.setItem("campusos-alert-muted", next ? "1" : "0");
  }

  return (
    <>
      <div className="flex items-center gap-2 text-xs">
        {permission === "default" ? (
          <button type="button" onClick={enable} className="rounded-full border border-border px-3 py-1.5 hover:bg-surface">
            Turn on alerts
          </button>
        ) : null}
        <button
          type="button"
          onClick={toggleMute}
          className="rounded-full border border-border px-3 py-1.5 hover:bg-surface"
          aria-pressed={muted}
        >
          {muted ? "Sound off" : "Sound on"}
        </button>
      </div>
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
        {alerts.map((a) => (
          <div key={a.id} className="pointer-events-auto rounded-2xl border border-border bg-bg p-3 text-sm shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                className="min-w-0 text-left"
                onClick={() => {
                  dismiss(a.id);
                  if (a.link) router.push(a.link);
                }}
              >
                <p className="font-semibold">{a.title}</p>
                {a.body ? <p className="mt-0.5 line-clamp-2 text-muted">{a.body}</p> : null}
              </button>
              <button type="button" aria-label="Dismiss" className="text-muted" onClick={() => dismiss(a.id)}>
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
