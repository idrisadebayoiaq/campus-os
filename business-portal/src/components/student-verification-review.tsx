"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

export function StudentVerificationReview({
  verificationId,
}: {
  verificationId: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function review(approve: boolean) {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc(
      "review_student_id_verification",
      {
        p_verification_id: verificationId,
        p_approve: approve,
        p_note: note || null,
      },
    );
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Review note (optional)"
        className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
      />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="button" disabled={loading} onClick={() => void review(true)}>
          Approve
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={loading}
          onClick={() => void review(false)}
        >
          Reject
        </Button>
      </div>
    </div>
  );
}
