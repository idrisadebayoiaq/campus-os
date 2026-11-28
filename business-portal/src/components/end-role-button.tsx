"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function EndRoleButton({
  kind,
  id,
  userId,
  classId,
  invited,
}: {
  kind: "office" | "class_rep";
  id: string;
  userId: string;
  classId: string | null;
  invited: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function end() {
    if (!window.confirm(invited ? "Cancel this invite?" : "End this role? The badge is removed straight away.")) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: err } =
      kind === "office"
        ? await supabase.rpc("end_office", { p_office: id })
        : await supabase.rpc("remove_class_rep", { p_class: classId, p_user: userId });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {error ? <span className="text-xs text-danger">{error}</span> : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void end()}
        className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-surface disabled:opacity-50"
      >
        {invited ? "Cancel invite" : "End role"}
      </button>
    </div>
  );
}
