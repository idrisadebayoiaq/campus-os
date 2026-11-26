"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export type Enquiry = {
  id: string;
  subject: string | null;
  message: string | null;
  status: string;
  created_at: string;
  student_id: string;
  business_id: string;
  listing: string;
  conversation_id: string | null;
  lastReply: string | null;
};

export type QuickReply = { id: string; business_id: string; label: string; body: string };

export function EnquiryBoard({
  userId,
  enquiries,
  students,
  quickReplies,
  businessId,
}: {
  userId: string;
  enquiries: Enquiry[];
  students: Record<string, { name: string; verified: boolean }>;
  quickReplies: QuickReply[];
  businessId: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, boolean>>({});

  const shown = enquiries.filter((e) => e.status === tab);
  const groups = [...new Set(shown.map((e) => e.listing))];

  async function reply(e: Enquiry, body: string, resolve: boolean) {
    const text = body.trim();
    if (!text && !resolve) return;
    setBusy(e.id);
    setError(null);
    const supabase = createClient();
    if (text) {
      if (!e.conversation_id) {
        setError("This enquiry has no chat yet, so a reply can't be sent.");
        setBusy(null);
        return;
      }
      const { error: err } = await supabase.from("messages").insert({
        conversation_id: e.conversation_id,
        sender_id: userId,
        body: text,
        message_type: "text",
      });
      if (err) {
        setError(err.message);
        setBusy(null);
        return;
      }
      setSent((s) => ({ ...s, [e.id]: true }));
      setDrafts((d) => ({ ...d, [e.id]: "" }));
    }
    if (resolve) await setStatus(e, "resolved", true);
    setBusy(null);
    router.refresh();
  }

  async function setStatus(e: Enquiry, status: "open" | "resolved", quiet = false) {
    if (!quiet) setBusy(e.id);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("listing_enquiries")
      .update({
        status,
        resolved_at: status === "resolved" ? new Date().toISOString() : null,
        resolved_by: status === "resolved" ? userId : null,
      })
      .eq("id", e.id);
    if (err) setError(err.message);
    if (!quiet) {
      setBusy(null);
      router.refresh();
    }
  }

  async function addQuick(form: FormData) {
    const supabase = createClient();
    const { error: err } = await supabase.from("business_quick_replies").insert({
      business_id: businessId,
      label: String(form.get("label")).trim(),
      body: String(form.get("body")).trim(),
    });
    if (err) setError(err.message);
    router.refresh();
  }

  async function removeQuick(id: string) {
    const supabase = createClient();
    await supabase.from("business_quick_replies").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex gap-2">
        {(["open", "resolved"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === t ? "bg-accent text-on-accent" : "border border-border"}`}
          >
            {t === "open" ? "Open" : "Resolved"} ({enquiries.filter((e) => e.status === t).length})
          </button>
        ))}
      </div>

      {!shown.length ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          {tab === "open" ? "No open enquiries. Nice work." : "Nothing resolved yet."}
        </p>
      ) : (
        groups.map((group) => (
          <section key={group} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{group}</h2>
            {shown
              .filter((e) => e.listing === group)
              .map((e) => {
                const s = students[e.student_id];
                return (
                  <article key={e.id} className="space-y-3 rounded-2xl border border-border p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">
                        {s?.name || "Student"}
                        {s?.verified ? (
                          <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs text-on-accent">Verified student</span>
                        ) : null}
                      </p>
                      <span className="text-xs text-muted">{new Date(e.created_at).toLocaleString()}</span>
                    </div>
                    <p className="rounded-xl bg-surface p-3">{e.message || e.subject}</p>
                    {sent[e.id] ? <p className="text-xs text-muted">Reply sent.</p> : null}
                    {tab === "open" ? (
                      <>
                        {quickReplies.length ? (
                          <div className="flex flex-wrap gap-2">
                            {quickReplies.map((q) => (
                              <button
                                key={q.id}
                                type="button"
                                disabled={busy === e.id}
                                onClick={() => setDrafts((d) => ({ ...d, [e.id]: q.body }))}
                                className="rounded-full border border-border px-3 py-1 text-xs hover:bg-surface"
                              >
                                {q.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <Input
                            value={drafts[e.id] ?? ""}
                            onChange={(ev) => setDrafts((d) => ({ ...d, [e.id]: ev.target.value }))}
                            placeholder="Write a reply…"
                            className="min-w-[14rem] flex-1"
                          />
                          <Button type="button" disabled={busy === e.id || !(drafts[e.id] ?? "").trim()} onClick={() => reply(e, drafts[e.id] ?? "", false)}>
                            Send
                          </Button>
                          <Button type="button" variant="secondary" disabled={busy === e.id} onClick={() => reply(e, drafts[e.id] ?? "", true)}>
                            {(drafts[e.id] ?? "").trim() ? "Send & resolve" : "Mark resolved"}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <Button type="button" variant="secondary" disabled={busy === e.id} onClick={() => setStatus(e, "open")}>
                        Reopen
                      </Button>
                    )}
                  </article>
                );
              })}
          </section>
        ))
      )}

      <section className="space-y-3 rounded-2xl border border-border p-4">
        <h2 className="font-medium">Quick replies</h2>
        <p className="text-sm text-muted">Saved answers you can drop into any reply, e.g. “Yes, it&apos;s still available.”</p>
        {quickReplies.map((q) => (
          <div key={q.id} className="flex items-start justify-between gap-3 text-sm">
            <p>
              <span className="font-medium">{q.label}:</span> <span className="text-muted">{q.body}</span>
            </p>
            <button type="button" className="shrink-0 text-xs text-red-600" onClick={() => removeQuick(q.id)}>
              Delete
            </button>
          </div>
        ))}
        <form
          className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]"
          onSubmit={(ev) => {
            ev.preventDefault();
            const form = new FormData(ev.currentTarget);
            ev.currentTarget.reset();
            void addQuick(form);
          }}
        >
          <Input name="label" placeholder="Label" required maxLength={40} />
          <Input name="body" placeholder="Message" required maxLength={1000} />
          <Button type="submit">Save</Button>
        </form>
      </section>
    </div>
  );
}
