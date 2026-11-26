"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export type ReviewRow = {
  id: string;
  business_name: string;
  rating: number;
  comment: string | null;
  business_reply: string | null;
  created_at: string;
  student: string;
};

function Stars({ n }: { n: number }) {
  return (
    <span aria-label={`${n} out of 5`} className="tracking-tight text-amber-500">
      {"★".repeat(n)}
      <span className="text-border">{"★".repeat(5 - n)}</span>
    </span>
  );
}

export function ReviewList({ reviews }: { reviews: ReviewRow[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reply(id: string) {
    const text = (drafts[id] ?? "").trim();
    if (!text) return;
    setBusy(id);
    const supabase = createClient();
    const { error: e } = await supabase.rpc("reply_to_review", { p_review: id, p_reply: text });
    setError(e ? e.message : null);
    setBusy(null);
    router.refresh();
  }

  if (!reviews.length) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
        No reviews yet. Students can review after a completed order, a viewing, or a resolved enquiry.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {reviews.map((r) => (
        <article key={r.id} className="space-y-2 rounded-2xl border border-border p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>
              <Stars n={r.rating} /> <span className="ml-2 font-medium">{r.student}</span>
              <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs">Verified purchase or visit</span>
            </p>
            <span className="text-xs text-muted">
              {r.business_name} · {new Date(r.created_at).toLocaleDateString()}
            </span>
          </div>
          {r.comment ? <p>{r.comment}</p> : <p className="text-muted">No comment.</p>}
          {r.business_reply ? (
            <p className="rounded-xl bg-surface p-3">
              <span className="font-medium">Your reply: </span>
              {r.business_reply}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <input
                value={drafts[r.id] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                placeholder="Reply publicly…"
                maxLength={800}
                className="h-10 min-w-[14rem] flex-1 rounded-2xl border border-border bg-bg px-3 outline-none focus:border-accent"
              />
              <Button type="button" className="!h-10" disabled={busy === r.id || !(drafts[r.id] ?? "").trim()} onClick={() => reply(r.id)}>
                Reply
              </Button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

export type ReportRow = {
  id: string;
  entity_type: string;
  reason: string;
  details: string | null;
  evidence_urls: string[];
  status: string;
  business_response: string | null;
  resolution: string | null;
  created_at: string;
};

export function ReportList({ reports }: { reports: ReportRow[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function respond(id: string) {
    setBusy(id);
    const supabase = createClient();
    const { error: e } = await supabase.rpc("respond_to_report", { p_report: id, p_response: drafts[id] ?? "" });
    setError(e ? e.message : null);
    setBusy(null);
    router.refresh();
  }

  if (!reports.length) {
    return <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">No reports about your listings.</p>;
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <p className="text-sm text-muted">Reporters stay anonymous. Give your side of the story; CampusOS staff decide the outcome.</p>
      {reports.map((r) => (
        <article key={r.id} className="space-y-2 rounded-2xl border border-border p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">
              {r.reason} <span className="ml-1 rounded-full border border-border px-2 py-0.5 text-xs font-normal">{r.status}</span>
            </p>
            <span className="text-xs text-muted">{new Date(r.created_at).toLocaleDateString()}</span>
          </div>
          {r.details ? <p className="text-muted">{r.details}</p> : null}
          {r.evidence_urls?.length ? (
            <div className="flex flex-wrap gap-2">
              {r.evidence_urls.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="Evidence" className="h-20 w-20 rounded-lg object-cover" />
                </a>
              ))}
            </div>
          ) : null}
          {r.resolution ? (
            <p className="rounded-xl bg-surface p-3">
              <span className="font-medium">Outcome: </span>
              {r.resolution}
            </p>
          ) : null}
          {r.business_response ? (
            <p className="rounded-xl bg-surface p-3">
              <span className="font-medium">Your response: </span>
              {r.business_response}
            </p>
          ) : r.status === "resolved" || r.status === "dismissed" ? null : (
            <div className="space-y-2">
              <textarea
                value={drafts[r.id] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                rows={3}
                placeholder="Explain what happened or what you have fixed…"
                className="w-full rounded-2xl border border-border bg-bg p-3 outline-none focus:border-accent"
              />
              <Button type="button" disabled={busy === r.id || (drafts[r.id] ?? "").trim().length < 3} onClick={() => respond(r.id)}>
                Send response
              </Button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
