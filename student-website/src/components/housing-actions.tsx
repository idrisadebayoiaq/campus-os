"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

export function HousingActions({
  unitId,
  businessId,
  loggedIn,
}: {
  unitId: string;
  businessId: string;
  loggedIn: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function requireAuth() {
    if (!loggedIn) {
      router.push(`/login?next=/housing/${unitId}`);
      return false;
    }
    return true;
  }

  async function save() {
    if (!(await requireAuth())) return;
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("saved_units").upsert({
      user_id: user!.id,
      unit_id: unitId,
    });
    setLoading(false);
    setStatus(error ? error.message : "Saved to your list.");
  }

  async function enquire(event: FormEvent) {
    event.preventDefault();
    if (!(await requireAuth())) return;
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("listing_enquiries").insert({
      unit_id: unitId,
      business_id: businessId,
      student_id: user!.id,
      subject: "Housing question",
      message: message.trim() || "I am interested in this room.",
    });
    setLoading(false);
    setStatus(error ? error.message : "Question sent. Check Inbox for updates.");
    if (!error) setMessage("");
  }

  async function inspect() {
    if (!(await requireAuth())) return;
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("inspection_requests").insert({
      unit_id: unitId,
      student_id: user!.id,
      message: "I would like to inspect this unit.",
      preferred_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    setLoading(false);
    setStatus(error ? error.message : "Inspection requested.");
  }

  async function report() {
    if (!(await requireAuth())) return;
    const reason = window.prompt("Why are you reporting this listing?");
    if (!reason) return;
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("reports").insert({
      reporter_id: user!.id,
      entity_type: "property_unit",
      entity_id: unitId,
      reason,
    });
    setLoading(false);
    setStatus(error ? error.message : "Report submitted. Your identity stays private.");
  }

  return (
    <div className="space-y-4 rounded-md border border-border p-5">
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={inspect} disabled={loading}>
          Request inspection
        </Button>
        <Button type="button" variant="secondary" onClick={save} disabled={loading}>
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={report} disabled={loading}>
          Report
        </Button>
      </div>
      <form onSubmit={enquire} className="space-y-3">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="Ask a question about this room"
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-fg"
        />
        <Button type="submit" variant="secondary" disabled={loading}>
          Ask question
        </Button>
      </form>
      {status ? <p className="text-sm text-muted">{status}</p> : null}
    </div>
  );
}
