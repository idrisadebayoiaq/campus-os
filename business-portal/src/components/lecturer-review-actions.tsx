"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

export function LecturerReviewActions({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  async function review(status: "approved" | "rejected" | "needs_changes" | "under_review") {
    setLoading(status);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("review_lecturer_application", {
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
      <label className="block text-sm font-medium">Decision notes</label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
        placeholder="Required for reject / needs changes"
      />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={!!loading}
          onClick={() => review("under_review")}
        >
          Under review
        </Button>
        <Button type="button" disabled={!!loading} onClick={() => review("approved")}>
          Approve
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!!loading || !reason.trim()}
          onClick={() => review("needs_changes")}
        >
          Needs changes
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={!!loading || !reason.trim()}
          onClick={() => review("rejected")}
        >
          Reject
        </Button>
      </div>
    </div>
  );
}
