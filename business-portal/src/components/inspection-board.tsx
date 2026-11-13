"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

type RequestRow = {
  id: string;
  status: string;
  message: string | null;
  preferred_at: string | null;
  created_at: string;
  property_units:
    | { title: string; properties: { title: string; business_id: string } | { title: string; business_id: string }[] }
    | { title: string; properties: { title: string; business_id: string } | { title: string; business_id: string }[] }[]
    | null;
};

export function InspectionBoard({ requests }: { requests: RequestRow[] }) {
  const router = useRouter();

  async function updateStatus(id: string, status: string) {
    const supabase = createClient();
    await supabase
      .from("inspection_requests")
      .update({ status, provider_note: `Marked ${status} by provider` })
      .eq("id", id);
    router.refresh();
  }

  return (
    <div className="divide-y divide-border rounded-md border border-border">
      {requests.map((req) => {
        const unit = Array.isArray(req.property_units) ? req.property_units[0] : req.property_units;
        const property = Array.isArray(unit?.properties) ? unit?.properties[0] : unit?.properties;
        return (
          <div key={req.id} className="space-y-3 px-4 py-4 text-sm">
            <div>
              <p className="font-medium">
                {property?.title} · {unit?.title}
              </p>
              <p className="text-muted">
                {req.status} · {req.preferred_at ? new Date(req.preferred_at).toLocaleString() : "No preferred time"}
              </p>
              <p className="mt-1 text-muted">{req.message}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => updateStatus(req.id, "accepted")}>
                Accept
              </Button>
              <Button type="button" variant="secondary" onClick={() => updateStatus(req.id, "declined")}>
                Decline
              </Button>
              <Button type="button" variant="ghost" onClick={() => updateStatus(req.id, "completed")}>
                Completed
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
