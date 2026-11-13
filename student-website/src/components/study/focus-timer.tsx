"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

const WORK_SEC = 25 * 60;
const BREAK_SEC = 5 * 60;

export function FocusTimer() {
  const [mode, setMode] = useState<"work" | "break">("work");
  const [seconds, setSeconds] = useState(WORK_SEC);
  const [running, setRunning] = useState(false);
  const [logged, setLogged] = useState<string | null>(null);
  const completedWork = useRef(0);

  useEffect(() => {
    if (!running || seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [running, seconds]);

  useEffect(() => {
    if (seconds > 0 || !running) return;
    void onIntervalEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, running]);

  async function onIntervalEnd() {
    setRunning(false);
    if (mode === "work") {
      completedWork.current += 25;
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("study_sessions").insert({
          user_id: user.id,
          minutes: 25,
          kind: "focus",
          note: "Pomodoro work block",
        });
        setLogged(`Logged ${completedWork.current} minutes of focus today (this session).`);
      }
      setMode("break");
      setSeconds(BREAK_SEC);
    } else {
      setMode("work");
      setSeconds(WORK_SEC);
    }
  }

  function reset() {
    setRunning(false);
    setMode("work");
    setSeconds(WORK_SEC);
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="space-y-6 rounded-md border border-border p-6 text-center">
      <p className="text-sm text-muted capitalize">{mode === "work" ? "Focus 25 min" : "Break 5 min"}</p>
      <p className="text-5xl font-semibold tabular-nums">
        {mm}:{ss}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={() => setRunning(true)} disabled={running}>
          Start
        </Button>
        <Button type="button" variant="secondary" onClick={() => setRunning(false)}>
          Pause
        </Button>
        <Button type="button" variant="ghost" onClick={reset}>
          Reset
        </Button>
      </div>
      {logged ? <p className="text-sm text-muted">{logged}</p> : null}
    </div>
  );
}
