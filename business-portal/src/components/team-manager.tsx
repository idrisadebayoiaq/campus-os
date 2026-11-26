"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export type TeamMember = {
  user_id: string | null;
  name: string | null;
  email: string | null;
  role: string;
  pending: boolean;
};

export function TeamManager({ businessId, members }: { businessId: string; members: TeamMember[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(form: FormData) {
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("add_business_member", {
      p_business: businessId,
      p_email: String(form.get("email")).trim().toLowerCase(),
      p_role: String(form.get("role")),
    });
    setBusy(false);
    if (error) {
      setMsg({ ok: false, text: error.message });
      return;
    }
    setMsg({
      ok: true,
      text:
        data === "invited"
          ? "Invite saved. They get access as soon as they sign up or log in with that email."
          : "Added. They can open the portal now.",
    });
    router.refresh();
  }

  async function remove(m: TeamMember) {
    if (!window.confirm(`Remove ${m.name || m.email}?`)) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("remove_business_member", {
      p_business: businessId,
      p_user: m.user_id,
      p_email: m.email,
    });
    setMsg(error ? { ok: false, text: error.message } : null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {msg ? <p className={`text-sm ${msg.ok ? "text-muted" : "text-red-600"}`}>{msg.text}</p> : null}
      <div className="divide-y divide-border rounded-md border border-border">
        {members.map((m) => (
          <div key={`${m.user_id}-${m.email}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <p className="font-medium">{m.name || m.email}</p>
              <p className="text-muted">
                {m.email}
                {m.pending ? " · invite pending" : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-border px-3 py-1 text-xs capitalize">{m.role}</span>
              {m.role !== "owner" ? (
                <button type="button" className="text-xs text-red-600" onClick={() => remove(m)}>
                  Remove
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <form
        className="grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-[1fr_10rem_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          e.currentTarget.reset();
          void add(form);
        }}
      >
        <h2 className="font-medium sm:col-span-3">Add a team member</h2>
        <Input name="email" type="email" placeholder="Their email" required />
        <select name="role" className="h-11 rounded-2xl border border-border bg-bg px-3 text-sm" defaultValue="staff">
          <option value="staff">Staff</option>
          <option value="manager">Manager</option>
        </select>
        <Button type="submit" disabled={busy}>
          Add
        </Button>
        <p className="text-xs text-muted sm:col-span-3">
          Staff handle orders, viewings and chats. Managers can also edit the menu, slots, deals and delivery. Only you
          manage the team, payouts and refunds.
        </p>
      </form>
    </div>
  );
}
