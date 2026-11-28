"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ClassRepButton({
  classId,
  userId,
  repRole,
  repStatus,
}: {
  classId: string;
  userId: string;
  repRole: string | null;
  repStatus: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError(null);
    const { error: err } = await fn();
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.refresh();
  }

  const supabase = createClient();
  const appoint = (role: "class_rep" | "assistant_rep") =>
    run(() => supabase.rpc("appoint_class_rep", { p_class: classId, p_user: userId, p_role: role }));
  const remove = () => run(() => supabase.rpc("remove_class_rep", { p_class: classId, p_user: userId }));

  const label = repRole === "assistant_rep" ? "Assistant rep" : "Class rep";
  const btn = "rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-surface disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {repRole ? (
        <>
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold">
            {label}
            {repStatus === "invited" ? " · invited" : ""}
          </span>
          <button type="button" className={btn} disabled={busy} onClick={() => void remove()}>
            {repStatus === "invited" ? "Cancel invite" : "Remove"}
          </button>
        </>
      ) : (
        <>
          <button type="button" className={btn} disabled={busy} onClick={() => void appoint("class_rep")}>
            Make class rep
          </button>
          <button type="button" className={btn} disabled={busy} onClick={() => void appoint("assistant_rep")}>
            Assistant rep
          </button>
        </>
      )}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}
