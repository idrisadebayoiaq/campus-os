"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

export function AdminApplicationActions({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  async function review(status: "approved" | "rejected" | "needs_changes" | "under_review") {
    setLoading(status);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("review_business_application", {
      app_id: applicationId,
      new_status: status,
      reason: reason || null,
    });
    setLoading(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <label className="block text-sm font-medium">Decision reason / notes</label>
      <textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={3}
        className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-fg"
        placeholder="Required for reject / needs changes"
      />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={!!loading}
          onClick={() => review("under_review")}
          variant="secondary"
        >
          {loading === "under_review" ? "…" : "Mark under review"}
        </Button>
        <Button type="button" disabled={!!loading} onClick={() => review("approved")}>
          {loading === "approved" ? "…" : "Approve"}
        </Button>
        <Button
          type="button"
          disabled={!!loading || !reason.trim()}
          onClick={() => review("needs_changes")}
          variant="secondary"
        >
          {loading === "needs_changes" ? "…" : "Needs changes"}
        </Button>
        <Button
          type="button"
          disabled={!!loading || !reason.trim()}
          onClick={() => review("rejected")}
          variant="ghost"
        >
          {loading === "rejected" ? "…" : "Reject"}
        </Button>
      </div>
    </div>
  );
}
