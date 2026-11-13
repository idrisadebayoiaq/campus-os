"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

type Report = {
  id: string;
  entity_type: string;
  entity_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
};

export function ReportQueue({ reports }: { reports: Report[] }) {
  const router = useRouter();

  async function setStatus(id: string, status: string) {
    const supabase = createClient();
    await supabase.from("reports").update({ status }).eq("id", id);
    router.refresh();
  }

  return (
    <div className="divide-y divide-border rounded-md border border-border">
      {reports.map((report) => (
        <div key={report.id} className="space-y-3 px-4 py-4 text-sm">
          <div>
            <p className="font-medium">
              {report.entity_type} · {report.status}
            </p>
            <p className="text-muted">{new Date(report.created_at).toLocaleString()}</p>
            <p className="mt-2">{report.reason}</p>
            {report.details ? <p className="mt-1 text-muted">{report.details}</p> : null}
            <p className="mt-2 font-mono text-xs text-muted">{report.entity_id}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setStatus(report.id, "reviewing")}>
              Reviewing
            </Button>
            <Button type="button" variant="secondary" onClick={() => setStatus(report.id, "resolved")}>
              Resolve
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStatus(report.id, "dismissed")}>
              Dismiss
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
