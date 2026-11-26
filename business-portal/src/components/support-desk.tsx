"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Button, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import {
  CATEGORY_OPTIONS,
  PRIORITY_LABEL,
  STATUS_LABEL,
  timeAgo,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/support";

/** Refreshes the server-rendered page whenever any ticket changes. */
export function LiveRefresh({ channel }: { channel: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sub = supabase
      .channel(channel)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => router.refresh(), 400);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(sub);
    };
  }, [channel, router]);
  return null;
}

type Agent = { user_id: string; name: string; email: string };

export function TicketControls({
  ticketId,
  status,
  priority,
  category,
  assignedTo,
  agents,
  currentUserId,
}: {
  ticketId: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  assignedTo: string | null;
  agents: Agent[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(patch: Record<string, string | null>) {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.from("support_tickets").update(patch).eq("id", ticketId);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  const selectClass = "h-10 w-full rounded-xl px-3 text-sm";

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap gap-2">
        {assignedTo !== currentUserId ? (
          <Button type="button" disabled={busy} onClick={() => void update({ assigned_to: currentUserId })} className="h-9 px-4">
            {assignedTo ? "Take over" : "Claim ticket"}
          </Button>
        ) : null}
        {status !== "resolved" ? (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void update({ status: "resolved" })}
            className="h-9 px-4"
          >
            Mark resolved
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void update({ status: "open" })}
            className="h-9 px-4"
          >
            Reopen
          </Button>
        )}
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted">Status</span>
        <select
          className={selectClass}
          value={status}
          disabled={busy}
          onChange={(e) => void update({ status: e.target.value })}
        >
          {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted">Assigned to</span>
        <select
          className={selectClass}
          value={assignedTo ?? ""}
          disabled={busy}
          onChange={(e) => void update({ assigned_to: e.target.value || null })}
        >
          <option value="">Unassigned</option>
          {agents.map((a) => (
            <option key={a.user_id} value={a.user_id}>
              {a.user_id === currentUserId ? `${a.name} (you)` : a.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted">Priority</span>
          <select
            className={selectClass}
            value={priority}
            disabled={busy}
            onChange={(e) => void update({ priority: e.target.value })}
          >
            {(Object.keys(PRIORITY_LABEL) as TicketPriority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted">Category</span>
          <select
            className={selectClass}
            value={category}
            disabled={busy}
            onChange={(e) => void update({ category: e.target.value })}
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

type Note = { id: string; body: string; created_at: string; author_name: string };

export function TicketNotes({ ticketId, userId, notes }: { ticketId: string; userId: string; notes: Note[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("support_ticket_notes")
      .insert({ ticket_id: ticketId, author_id: userId, body: draft.trim() });
    setBusy(false);
    if (!error) {
      setDraft("");
      router.refresh();
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div>
        <p className="text-sm font-semibold">Internal notes</p>
        <p className="text-xs text-muted">Only the support team sees these.</p>
      </div>
      {notes.length ? (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-sm">
              <p className="whitespace-pre-wrap">{n.body}</p>
              <p className="mt-1 text-[11px] text-muted">
                {n.author_name} · {timeAgo(n.created_at)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={onSubmit} className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Add a note for the team…"
          className="w-full rounded-xl px-3 py-2 text-sm"
        />
        <Button type="submit" variant="secondary" disabled={busy || !draft.trim()} className="h-9 px-4">
          Add note
        </Button>
      </form>
    </div>
  );
}

export function SaveAsAnswer({
  ticketId,
  defaultTitle,
  defaultBody,
}: {
  ticketId: string;
  defaultTitle: string;
  defaultBody: string;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [body, setBody] = useState(defaultBody);
  const [audience, setAudience] = useState("all");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim() || !body.trim()) return;
    setState("saving");
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: insertError } = await supabase.from("support_articles").insert({
      title: title.trim(),
      body: body.trim(),
      audience,
      source_ticket_id: ticketId,
      created_by: user?.id ?? null,
    });
    if (insertError) {
      setError(insertError.message);
      setState("idle");
      return;
    }
    setState("saved");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border border-dashed border-border px-4 py-3 text-left text-sm hover:border-accent"
      >
        <span className="font-semibold">Teach the assistant</span>
        <span className="block text-xs text-muted">
          Save this answer so the assistant can reply to the same question next time.
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <p className="text-sm font-semibold">Teach the assistant</p>
      {state === "saved" ? (
        <p className="text-sm text-success">Saved. The assistant will use this answer from now on.</p>
      ) : (
        <>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Question, e.g. How do I change my payout bank?" />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder="The answer, written for any user who asks the same thing"
            className="w-full rounded-xl px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select value={audience} onChange={(e) => setAudience(e.target.value)} className="h-9 rounded-xl px-3 text-sm">
              <option value="all">Everyone</option>
              <option value="student">Students</option>
              <option value="business">Businesses</option>
            </select>
            <Button type="button" onClick={() => void save()} disabled={state === "saving"} className="h-9 px-4">
              Save answer
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="h-9 px-4">
              Cancel
            </Button>
          </div>
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </>
      )}
    </div>
  );
}

export type Article = {
  id: string;
  title: string;
  body: string;
  audience: string;
  category: string;
  keywords: string | null;
  published: boolean;
  updated_at: string;
};

export function ArticleEditor({ article, prefillTitle }: { article?: Article; prefillTitle?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(prefillTitle));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      title: String(form.get("title") || "").trim(),
      body: String(form.get("body") || "").trim(),
      audience: String(form.get("audience") || "all"),
      category: String(form.get("category") || "other"),
      keywords: String(form.get("keywords") || "").trim() || null,
      published: form.get("published") === "on",
      updated_at: new Date().toISOString(),
    };
    if (!payload.title || !payload.body) {
      setError("Add a question and an answer.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: saveError } = article
      ? await supabase.from("support_articles").update(payload).eq("id", article.id)
      : await supabase.from("support_articles").insert(payload);
    setBusy(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function remove() {
    if (!article || !window.confirm(`Delete "${article.title}"?`)) return;
    const supabase = createClient();
    await supabase.from("support_articles").delete().eq("id", article.id);
    router.refresh();
  }

  if (!open) {
    return article ? (
      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {article.title}
            {!article.published ? (
              <span className="ml-2 rounded-full bg-soft px-2 py-0.5 text-[11px] text-muted">Draft</span>
            ) : null}
          </p>
          <p className="line-clamp-2 text-xs text-muted">{article.body}</p>
          <p className="mt-1 text-[11px] text-muted">
            {article.audience === "all" ? "Everyone" : article.audience === "student" ? "Students" : "Businesses"} ·
            updated {timeAgo(article.updated_at)}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="secondary" onClick={() => setOpen(true)} className="h-8 px-3 text-xs">
            Edit
          </Button>
          <Button type="button" variant="ghost" onClick={() => void remove()} className="h-8 px-3 text-xs text-danger">
            Delete
          </Button>
        </div>
      </div>
    ) : (
      <Button type="button" onClick={() => setOpen(true)}>
        Add an answer
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <Input name="title" defaultValue={article?.title ?? prefillTitle ?? ""} placeholder="Question people ask" required />
      <textarea
        name="body"
        defaultValue={article?.body ?? ""}
        rows={6}
        required
        placeholder="Answer, in plain words with steps where useful"
        className="w-full rounded-xl px-3 py-2 text-sm"
      />
      <Input
        name="keywords"
        defaultValue={article?.keywords ?? ""}
        placeholder="Other words people use (optional), e.g. payout bank account withdraw"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select name="audience" defaultValue={article?.audience ?? "all"} className="h-9 rounded-xl px-3 text-sm">
          <option value="all">Everyone</option>
          <option value="student">Students</option>
          <option value="business">Businesses</option>
        </select>
        <select name="category" defaultValue={article?.category ?? "other"} className="h-9 rounded-xl px-3 text-sm">
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="published" defaultChecked={article?.published ?? true} />
          Published
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} className="h-9 px-4">
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="h-9 px-4">
          Cancel
        </Button>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </form>
  );
}

type Reply = { id: string; title: string; body: string };

export function SavedReplyManager({ replies }: { replies: Reply[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase
      .from("support_saved_replies")
      .insert({ title: title.trim(), body: body.trim(), created_by: user?.id ?? null });
    setBusy(false);
    setTitle("");
    setBody("");
    router.refresh();
  }

  async function remove(id: string) {
    const supabase = createClient();
    await supabase.from("support_saved_replies").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {replies.length ? (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {replies.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{r.title}</p>
                <p className="line-clamp-2 text-xs text-muted">{r.body}</p>
              </div>
              <Button type="button" variant="ghost" onClick={() => void remove(r.id)} className="h-8 px-3 text-xs text-danger">
                Delete
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">No saved replies yet.</p>
      )}
      <form onSubmit={add} className="space-y-2 rounded-2xl border border-border bg-surface p-4">
        <p className="text-sm font-semibold">New saved reply</p>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name, e.g. Ask for order time" />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Reply text the team can insert with one click"
          className="w-full rounded-xl px-3 py-2 text-sm"
        />
        <Button type="submit" disabled={busy || !title.trim() || !body.trim()} className="h-9 px-4">
          Save reply
        </Button>
      </form>
    </div>
  );
}

type TeamRow = {
  email: string;
  user_id: string | null;
  name: string | null;
  state: "active" | "invited";
  since: string;
  open_tickets: number;
  resolved_tickets: number;
  avg_rating: number | null;
};

export function SupportTeamManager({ team, signupUrl }: { team: TeamRow[]; signupUrl: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_add_support_agent", { p_email: email.trim() });
    setBusy(false);
    if (error) {
      setMessage({ tone: "error", text: error.message });
      return;
    }
    setMessage({
      tone: "ok",
      text:
        data === "added"
          ? `${email.trim()} is now on the support team. They'll see the Support desk next time they open the Portal.`
          : `Invite saved. Ask ${email.trim()} to sign up at ${signupUrl} with this email — they'll land on the Support desk.`,
    });
    setEmail("");
    router.refresh();
  }

  async function remove(row: TeamRow) {
    if (!window.confirm(`Remove ${row.email} from the support team? Their open tickets become unassigned.`)) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_remove_support_agent", { p_email: row.email });
    if (error) {
      setMessage({ tone: "error", text: error.message });
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={add} className="space-y-3 rounded-2xl border border-border bg-surface p-5">
        <div>
          <p className="font-semibold">Add someone to the support team</p>
          <p className="text-sm text-muted">
            If they already have a CampusOS account they join right away. Otherwise they become a
            support agent when they sign up with this email.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="agent@campusos.app"
            required
          />
          <Button type="submit" disabled={busy} className="shrink-0">
            {busy ? "Adding…" : "Add to team"}
          </Button>
        </div>
        {message ? (
          <p className={`text-sm ${message.tone === "ok" ? "text-success" : "text-danger"}`}>{message.text}</p>
        ) : null}
      </form>

      {team.length ? (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {team.map((row) => (
            <div key={row.email} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {row.name || row.email}
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      row.state === "active" ? "bg-success/15 text-success" : "bg-soft text-muted"
                    }`}
                  >
                    {row.state === "active" ? "Active" : "Invited"}
                  </span>
                </p>
                <p className="truncate text-xs text-muted">{row.email}</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted">
                {row.state === "active" ? (
                  <>
                    <span>{row.open_tickets} open</span>
                    <span>{row.resolved_tickets} resolved</span>
                    <span>{row.avg_rating ? `★ ${row.avg_rating}` : "No ratings"}</span>
                  </>
                ) : (
                  <span>Waiting for signup</span>
                )}
                <Button type="button" variant="ghost" onClick={() => void remove(row)} className="h-8 px-3 text-xs text-danger">
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-muted">
          No support agents yet. Until you add some, new tickets notify admins.
        </p>
      )}
    </div>
  );
}
