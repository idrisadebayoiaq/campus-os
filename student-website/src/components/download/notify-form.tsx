"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Input } from "@/components/ui";

const STORAGE_KEY = "campusos_apk_notify_email";

export function NotifyForm() {
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    try {
      localStorage.setItem(STORAGE_KEY, trimmed);
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Email for APK launch">
        <Input
          type="email"
          name="email"
          placeholder="you@school.edu"
          value={email}
          onChange={(e) => {
            setSaved(false);
            setEmail(e.target.value);
          }}
          autoComplete="email"
          required
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">Notify me</Button>
        {saved ? (
          <p className="text-sm text-success">Saved on this device. We&apos;ll email when the APK ships.</p>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        Stored locally in your browser only until CampusOS syncs waitlist signups.
      </p>
    </form>
  );
}