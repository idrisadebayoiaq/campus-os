"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

type LiveCode = { code: string; seconds_left: number; present: number; enrolled: number; closes_at: string };

/** Lecturer side of code attendance: a 6-digit code that changes every 30 seconds. */
export function CodeAttendancePanel({ classId }: { classId: string }) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [live, setLive] = useState<LiveCode | null>(null);
  const [minutes, setMinutes] = useState(10);
  const [label, setLabel] = useState("Lecture");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const fetchedAt = useRef(0);

  const findOpen = useCallback(async () => {
    const { data } = await createClient().rpc("class_open_attendance", { p_class: classId });
    const row = (data as { session_id: string }[] | null)?.[0];
    setSessionId(row?.session_id ?? null);
  }, [classId]);

  useEffect(() => {
    void findOpen();
  }, [findOpen]);

  useEffect(() => {
    if (!sessionId) {
      setLive(null);
      return;
    }
    let stopped = false;
    async function tick() {
      const { data, error: err } = await createClient().rpc("attendance_code", { p_session: sessionId });
      if (stopped) return;
      if (err) {
        setError(err.message);
        return;
      }
      const row = (data as LiveCode[] | null)?.[0];
      if (!row) return;
      fetchedAt.current = Date.now();
      setLive(row);
      if (new Date(row.closes_at).getTime() <= Date.now()) {
        setSessionId(null);
        router.refresh();
      }
    }
    void tick();
    const poll = setInterval(() => void tick(), 4000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stopped = true;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [sessionId, router]);

  async function start() {
    setBusy(true);
    setError(null);
    setDone(null);
    const { data, error: err } = await createClient().rpc("open_code_attendance", {
      p_class: classId,
      p_minutes: minutes,
      p_label: label.trim() || null,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSessionId(data as string);
  }

  async function close() {
    if (!sessionId) return;
    setBusy(true);
    const { data, error: err } = await createClient().rpc("close_attendance", { p_session: sessionId });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(`Attendance closed. ${live?.present ?? 0} present, ${Number(data ?? 0)} marked absent.`);
    setSessionId(null);
    router.refresh();
  }

  const secondsLeft = live ? Math.max(0, live.seconds_left - Math.floor((now - fetchedAt.current) / 1000)) : 0;
  const minutesLeft = live ? Math.max(0, Math.ceil((new Date(live.closes_at).getTime() - now) / 60000)) : 0;

  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <div>
        <p className="font-medium">Code attendance</p>
        <p className="text-sm text-muted">
          Show or read out the code. Students type it in the app. It changes every 30 seconds, so it only works in
          the room. Your class reps can run this from their phones too.
        </p>
      </div>
      {sessionId && live ? (
        <div className="space-y-3 text-center">
          <p className="font-mono text-5xl font-semibold tracking-[0.4em]">{live.code}</p>
          <div className="mx-auto h-1.5 max-w-sm rounded-full bg-accent-soft">
            <div className="h-1.5 rounded-full bg-accent transition-all" style={{ width: `${(secondsLeft / 30) * 100}%` }} />
          </div>
          <p className="text-sm text-muted">
            New code in {secondsLeft}s · closes in {minutesLeft} min
          </p>
          <p className="text-lg font-medium">
            {live.present} of {live.enrolled} present
          </p>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void close()}>
            {busy ? "Closing…" : "Close and mark the rest absent"}
          </Button>
        </div>
      ) : sessionId ? (
        <p className="text-sm text-muted">Loading the code…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end">
          <Field label="Label">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Lecture" />
          </Field>
          <Field label="Open for">
            <select
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="h-11 w-full rounded-2xl border border-border bg-bg px-3 text-sm"
            >
              {[5, 10, 15, 20, 30].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </Field>
          <Button type="button" disabled={busy} onClick={() => void start()}>
            {busy ? "Starting…" : "Start"}
          </Button>
        </div>
      )}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {done ? <p className="text-sm text-success">{done}</p> : null}
    </div>
  );
}
