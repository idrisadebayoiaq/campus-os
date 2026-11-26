"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** One-tap switch to stop (or resume) taking new orders. */
export function PauseOrders({
  businessId,
  name,
  accepting,
}: {
  businessId: string;
  name: string;
  accepting: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(accepting);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase.rpc("set_accepting_orders", { p_business: businessId, p_on: !on });
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    setOn(!on);
    router.refresh();
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${
        on ? "border-border bg-surface" : "border-red-500/50 bg-red-500/5"
      }`}
    >
      <div>
        <p className="font-medium">
          {name} · {on ? "Taking orders" : "Orders paused"}
        </p>
        <p className="text-muted">
          {on
            ? "Students can order during your opening hours."
            : "Students see you as closed until you resume."}
          {error ? <span className="ml-2 text-red-600">{error}</span> : null}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={busy}
        onClick={toggle}
        className={`relative h-7 w-12 rounded-full transition disabled:opacity-50 ${on ? "bg-accent" : "bg-border"}`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-bg shadow transition-all ${on ? "left-[1.35rem]" : "left-0.5"}`}
        />
        <span className="sr-only">Toggle order intake</span>
      </button>
    </div>
  );
}
