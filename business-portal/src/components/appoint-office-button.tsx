"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

const PRESETS = [
  { office: "sug_president", title: "SUG President", scope: "school" },
  { office: "sug_vice_president", title: "SUG Vice President", scope: "school" },
  { office: "general_secretary", title: "General Secretary", scope: "school" },
  { office: "financial_secretary", title: "Financial Secretary", scope: "school" },
  { office: "pro", title: "Public Relations Officer", scope: "school" },
  { office: "faculty_president", title: "Faculty President", scope: "faculty" },
  { office: "department_president", title: "Department President", scope: "department" },
  { office: "custom", title: "", scope: "school" },
] as const;

const selectClass = "h-11 w-full rounded-2xl border border-border bg-bg px-3 text-sm";

type Option = { id: string; name: string };

export function AppointOfficeButton({
  institutionId,
  userId,
  name,
  faculties,
  departments,
}: {
  institutionId: string;
  userId: string;
  name: string;
  faculties: Option[];
  departments: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState(0);
  const [title, setTitle] = useState<string>(PRESETS[0].title);
  const [scope, setScope] = useState<string>(PRESETS[0].scope);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function pick(i: number) {
    setPreset(i);
    setTitle(PRESETS[i].title);
    setScope(PRESETS[i].scope);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const { error: err } = await createClient().rpc("appoint_office", {
      p_institution: institutionId,
      p_user: userId,
      p_office: PRESETS[preset].office,
      p_title: title.trim(),
      p_scope: scope,
      p_scope_id: scope === "school" ? null : String(form.get("scope_id") || "") || null,
      p_term_ends_on: String(form.get("term_ends_on") || "") || null,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        {done ? <span className="text-xs text-success">Invite sent</span> : null}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-surface"
        >
          Appoint
        </button>
      </div>
    );
  }

  const scopeOptions = scope === "faculty" ? faculties : scope === "department" ? departments : [];

  return (
    <form onSubmit={onSubmit} className="w-full space-y-3 rounded-xl border border-border bg-surface p-4">
      <p className="text-sm font-medium">Appoint {name}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Office">
          <select value={preset} onChange={(e) => pick(Number(e.target.value))} className={selectClass}>
            {PRESETS.map((p, i) => (
              <option key={p.office} value={i}>
                {p.title || "Other title…"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title shown on their profile">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={60} />
        </Field>
        <Field label="Covers">
          <select value={scope} onChange={(e) => setScope(e.target.value)} className={selectClass}>
            <option value="school">Whole school</option>
            <option value="faculty">One faculty</option>
            <option value="department">One department</option>
          </select>
        </Field>
        {scope !== "school" ? (
          <Field label={scope === "faculty" ? "Faculty" : "Department"}>
            <select name="scope_id" required className={selectClass} defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              {scopeOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Term ends (optional)">
          <Input name="term_ends_on" type="date" />
        </Field>
      </div>
      <p className="text-xs text-muted">
        They get a notification and must accept before the badge shows. They can post up to 3 announcements a day to
        the students their office covers.
      </p>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || title.trim().length < 2}>
          {busy ? "Sending…" : "Send invite"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
