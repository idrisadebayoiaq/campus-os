"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { Button, Field, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { initialsFromName } from "@/lib/nav";

export type ProfileData = {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  preferredName: string;
  phone: string;
  avatarUrl: string | null;
};

export type BusinessLink = { id: string; name: string; role: string };

type Status = { ok: boolean; text: string } | null;

function Card({ title, description, children, danger }: { title: string; description?: string; children: ReactNode; danger?: boolean }) {
  return (
    <section className={`space-y-4 rounded-2xl border p-5 ${danger ? "border-red-500/40" : "border-border"}`}>
      <div className="space-y-1">
        <h2 className={`text-lg font-medium ${danger ? "text-red-600 dark:text-red-400" : ""}`}>{title}</h2>
        {description ? <p className="text-sm text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Note({ status }: { status: Status }) {
  if (!status) return null;
  return <p className={`text-sm ${status.ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>{status.text}</p>;
}

/**
 * Everyone manages their own profile here. `minimal` (support and admin accounts) only
 * gets photo, name and password: no phone, business links or account deletion.
 */
export function ProfileForm({
  profile,
  minimal,
  businesses,
  lecturerTitle,
  blockers,
}: {
  profile: ProfileData;
  minimal: boolean;
  businesses: BusinessLink[];
  lecturerTitle: string | null;
  blockers: string[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [first, setFirst] = useState(profile.firstName);
  const [last, setLast] = useState(profile.lastName);
  const [preferred, setPreferred] = useState(profile.preferredName);
  const [phone, setPhone] = useState(profile.phone);
  const [avatar, setAvatar] = useState(profile.avatarUrl);
  const [title, setTitle] = useState(lecturerTitle ?? "");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [closing, setClosing] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deletePw, setDeletePw] = useState("");

  const display = preferred.trim() || `${first} ${last}`.trim() || profile.email.split("@")[0];
  const say = (key: string, ok: boolean, text: string) => setStatus((s) => ({ ...s, [key]: { ok, text } }));

  async function saveDetails() {
    setBusy("details");
    const supabase = createClient();
    const payload: Record<string, unknown> = {
      first_name: first.trim() || null,
      last_name: last.trim() || null,
      preferred_name: preferred.trim() || null,
      full_name: `${first.trim()} ${last.trim()}`.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (!minimal) payload.phone = phone.trim() || null;
    let { error } = await supabase.from("profiles").update(payload).eq("id", profile.userId);
    if (error) ({ error } = await supabase.from("profiles").insert({ id: profile.userId, ...payload }));
    setBusy(null);
    if (error) return say("details", false, error.message);
    say("details", true, "Saved.");
    router.refresh();
  }

  async function uploadPhoto(file: File) {
    if (file.size > 5 * 1024 * 1024) return say("photo", false, "Choose a photo under 5 MB.");
    setBusy("photo");
    const supabase = createClient();
    const ext = file.type.includes("png") ? "png" : file.type.includes("webp") ? "webp" : "jpg";
    const path = `${profile.userId}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
    if (upErr) {
      setBusy(null);
      return say("photo", false, upErr.message);
    }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    let { error } = await supabase.from("profiles").update({ avatar_url: pub.publicUrl }).eq("id", profile.userId);
    if (error) ({ error } = await supabase.from("profiles").insert({ id: profile.userId, avatar_url: pub.publicUrl }));
    setBusy(null);
    if (error) return say("photo", false, error.message);
    setAvatar(`${pub.publicUrl}?t=${Date.now()}`);
    say("photo", true, "Photo updated.");
    router.refresh();
  }

  async function removePhoto() {
    setBusy("photo");
    const { error } = await createClient().from("profiles").update({ avatar_url: null }).eq("id", profile.userId);
    setBusy(null);
    if (error) return say("photo", false, error.message);
    setAvatar(null);
    say("photo", true, "Photo removed.");
    router.refresh();
  }

  async function savePassword() {
    if (pw.length < 8) return say("password", false, "Use at least 8 characters.");
    if (pw !== pw2) return say("password", false, "The two passwords don't match.");
    setBusy("password");
    const { error } = await createClient().auth.updateUser({ password: pw });
    setBusy(null);
    if (error) return say("password", false, error.message);
    setPw("");
    setPw2("");
    say("password", true, "Password changed.");
  }

  async function saveTitle() {
    setBusy("title");
    const { error } = await createClient()
      .from("lecturer_profiles")
      .update({ staff_title: title.trim() || null, updated_at: new Date().toISOString() })
      .eq("user_id", profile.userId);
    setBusy(null);
    say("title", !error, error ? error.message : "Saved.");
  }

  async function deleteAccount() {
    if (confirmText.trim() !== "DELETE") return say("delete", false, "Type DELETE to confirm.");
    setBusy("delete");
    const supabase = createClient();
    const auth = await supabase.auth.signInWithPassword({ email: profile.email, password: deletePw });
    if (auth.error) {
      setBusy(null);
      return say("delete", false, "That password is not right.");
    }
    const { error } = await supabase.rpc("delete_my_account", { p_confirm: "DELETE" });
    if (error) {
      setBusy(null);
      return say("delete", false, error.message);
    }
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card title="Photo" description="Shown next to your name in messages and across CampusOS.">
        <div className="flex items-center gap-4">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="h-20 w-20 rounded-full border border-border object-cover" />
          ) : (
            <span className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-accent text-xl font-semibold text-on-accent">
              {initialsFromName(display)}
            </span>
          )}
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadPhoto(f);
                e.target.value = "";
              }}
            />
            <Button type="button" variant="secondary" disabled={busy === "photo"} onClick={() => fileRef.current?.click()}>
              {busy === "photo" ? "Working…" : "Choose photo"}
            </Button>
            {avatar ? (
              <Button type="button" variant="ghost" disabled={busy === "photo"} onClick={removePhoto}>
                Remove
              </Button>
            ) : null}
          </div>
        </div>
        <Note status={status.photo ?? null} />
      </Card>

      <Card title="Your details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name">
            <Input value={first} onChange={(e) => setFirst(e.target.value)} />
          </Field>
          <Field label="Last name">
            <Input value={last} onChange={(e) => setLast(e.target.value)} />
          </Field>
        </div>
        <Field label="Preferred name">
          <Input value={preferred} onChange={(e) => setPreferred(e.target.value)} placeholder="What should CampusOS call you?" />
        </Field>
        {!minimal ? (
          <Field label="Phone number">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="e.g. 0801 234 5678" />
          </Field>
        ) : null}
        <Field label="Email">
          <Input value={profile.email} readOnly disabled />
        </Field>
        <p className="text-xs text-muted">Your sign-in email can&apos;t be changed here. Contact support if you need to change it.</p>
        <Note status={status.details ?? null} />
        <Button type="button" disabled={busy === "details"} onClick={saveDetails}>
          {busy === "details" ? "Saving…" : "Save details"}
        </Button>
      </Card>

      {lecturerTitle !== null ? (
        <Card title="Lecturer profile">
          <Field label="Staff title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Senior Lecturer" />
          </Field>
          <Note status={status.title ?? null} />
          <Button type="button" variant="secondary" disabled={busy === "title"} onClick={saveTitle}>
            {busy === "title" ? "Saving…" : "Save title"}
          </Button>
        </Card>
      ) : null}

      {!minimal && businesses.length ? (
        <Card title="Your businesses" description="Manage the details students see from the setup page.">
          <div className="divide-y divide-border rounded-xl border border-border text-sm">
            {businesses.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="font-medium">{b.name}</span>
                <span className="text-muted capitalize">{b.role}</span>
              </div>
            ))}
          </div>
          <Link href="/setup" className="inline-block text-sm underline underline-offset-2">
            Edit business details
          </Link>
        </Card>
      ) : null}

      <Card title="Password">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New password">
            <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Repeat new password">
            <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        <Note status={status.password ?? null} />
        <Button type="button" variant="secondary" disabled={busy === "password" || !pw} onClick={savePassword}>
          {busy === "password" ? "Saving…" : "Change password"}
        </Button>
      </Card>

      {!minimal ? (
        <Card
          danger
          title="Delete account"
          description="Closes your account and removes your name, photo and contact details. Your businesses go offline. Anonymous payment records are kept for accounting. This can't be undone."
        >
          {blockers.length ? (
            <div className="space-y-1 text-sm">
              <p className="font-medium">Before you can delete your account:</p>
              <ul className="list-disc space-y-1 pl-5 text-muted">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          ) : closing ? (
            <div className="space-y-4">
              <Field label="Type DELETE to confirm">
                <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
              </Field>
              <Field label="Your password">
                <Input type="password" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} autoComplete="current-password" />
              </Field>
              <Note status={status.delete ?? null} />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" className="border-red-500/50 text-red-600 dark:text-red-400" disabled={busy === "delete"} onClick={deleteAccount}>
                  {busy === "delete" ? "Deleting…" : "Delete my account"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setClosing(false)}>
                  Keep my account
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="secondary" className="border-red-500/50 text-red-600 dark:text-red-400" onClick={() => setClosing(true)}>
              Delete my account
            </Button>
          )}
        </Card>
      ) : null}
    </div>
  );
}
