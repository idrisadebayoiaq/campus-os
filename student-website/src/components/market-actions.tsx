"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

export function MarketActions({
  listingId,
  businessId,
  loggedIn,
}: {
  listingId: string;
  businessId: string | null;
  loggedIn: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function enquire(event: FormEvent) {
    event.preventDefault();
    if (!loggedIn) {
      router.push(`/login?next=/marketplace/${listingId}`);
      return;
    }
    if (!businessId) {
      setStatus("Seller business profile missing.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("listing_enquiries").insert({
      business_id: businessId,
      student_id: user!.id,
      subject: "Marketplace enquiry",
      message: message.trim() || "Is this still available?",
      marketplace_listing_id: listingId,
    });
    setLoading(false);
    setStatus(error ? error.message : "Enquiry sent. Check Inbox for replies.");
    if (!error) setMessage("");
  }

  async function report() {
    if (!loggedIn) {
      router.push(`/login?next=/marketplace/${listingId}`);
      return;
    }
    const reason = window.prompt("Why are you reporting this listing?");
    if (!reason) return;
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("reports").insert({
      reporter_id: user!.id,
      entity_type: "marketplace_listing",
      entity_id: listingId,
      reason,
    });
    setLoading(false);
    setStatus(error ? error.message : "Report submitted privately to CampusOS.");
  }

  return (
    <div className="space-y-4 rounded-md border border-border p-5">
      <form onSubmit={enquire} className="space-y-3">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="Ask about availability, meetup, or service details"
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={loading}>
            Send enquiry
          </Button>
          <Button type="button" variant="ghost" onClick={report} disabled={loading}>
            Report
          </Button>
        </div>
      </form>
      <p className="text-xs text-muted">
        CampusOS does not escrow marketplace payments. Prefer meetups around your campus.
      </p>
      {status ? <p className="text-sm text-muted">{status}</p> : null}
    </div>
  );
}
