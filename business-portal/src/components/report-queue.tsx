"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type Report = {
  id: string;
  entity_type: string;
  entity_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  evidence_urls?: string[] | null;
  business_response?: string | null;
  resolution?: string | null;
  business_name?: string | null;
};

export function ReportQueue({ reports }: { reports: Report[] }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, status: "reviewing" | "resolved" | "dismissed", action: "none" | "hide_listing" | "pause_business" = "none") {
    if (action !== "none" && !window.confirm(action === "hide_listing" ? "Hide this listing from students?" : "Pause this whole business?")) return;
    setBusy(id);
    const supabase = createClient();
    const { error: e } = await supabase.rpc("resolve_report", {
      p_report: id,
      p_status: status,
      p_resolution: notes[id] ?? "",
      p_action: action,
    });
    setError(e ? e.message : null);
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="divide-y divide-border rounded-md border border-border">
        {reports.map((report) => {
          const closed = report.status === "resolved" || report.status === "dismissed";
          return (
            <div key={report.id} className="space-y-3 px-4 py-4 text-sm">
              <div>
                <p className="font-medium">
                  {report.entity_type} · {report.status}
                  {report.business_name ? <span className="text-muted"> · {report.business_name}</span> : null}
                </p>
                <p className="text-muted">{new Date(report.created_at).toLocaleString()}</p>
                <p className="mt-2">{report.reason}</p>
                {report.details ? <p className="mt-1 text-muted">{report.details}</p> : null}
                {report.evidence_urls?.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {report.evidence_urls.map((u) => (
                      <a key={u} href={u} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="Evidence" className="h-20 w-20 rounded-lg object-cover" />
                      </a>
                    ))}
                  </div>
                ) : null}
                {report.business_response ? (
                  <p className="mt-2 rounded-xl bg-surface p-3">
                    <span className="font-medium">Business response: </span>
                    {report.business_response}
                  </p>
                ) : null}
                {report.resolution ? (
                  <p className="mt-2 rounded-xl bg-surface p-3">
                    <span className="font-medium">Outcome: </span>
                    {report.resolution}
                  </p>
                ) : null}
                <p className="mt-2 font-mono text-xs text-muted">{report.entity_id}</p>
              </div>
              {closed ? null : (
                <>
                  <input
                    value={notes[report.id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [report.id]: e.target.value }))}
                    placeholder="Outcome note (sent to the reporter and the business)"
                    className="h-10 w-full rounded-2xl border border-border bg-bg px-3 outline-none focus:border-accent"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" disabled={busy === report.id} onClick={() => decide(report.id, "reviewing")}>
                      Reviewing
                    </Button>
                    <Button type="button" variant="secondary" disabled={busy === report.id} onClick={() => decide(report.id, "resolved")}>
                      Resolve
                    </Button>
                    <Button type="button" variant="secondary" disabled={busy === report.id} onClick={() => decide(report.id, "resolved", "hide_listing")}>
                      Resolve & hide listing
                    </Button>
                    <Button type="button" variant="secondary" disabled={busy === report.id} onClick={() => decide(report.id, "resolved", "pause_business")}>
                      Resolve & pause business
                    </Button>
                    <Button type="button" variant="ghost" disabled={busy === report.id} onClick={() => decide(report.id, "dismissed")}>
                      Dismiss
                    </Button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
