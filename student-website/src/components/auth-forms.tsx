"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

async function destinationAfterAuth() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/login";
  return "/";
}

function PasswordField({
  name,
  autoComplete,
  placeholder,
}: {
  name: string;
  autoComplete: string;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        name={name}
        type={show ? "text" : "password"}
        required
        autoComplete={autoComplete}
        minLength={6}
        placeholder={placeholder}
        className="pr-16"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-muted hover:text-fg"
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "");
    const password = String(form.get("password") || "");
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    const next = searchParams.get("next");
    const dest =
      next && next.startsWith("/") && next !== "/"
        ? next
        : await destinationAfterAuth();
    router.push(dest);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Email">
        <Input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@school.edu.ng"
        />
      </Field>
      <Field label="Password">
        <PasswordField name="password" autoComplete="current-password" />
      </Field>
      {error ? (
        <p className="rounded-md border border-danger/30 bg-surface px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Signing in…" : "Log in"}
      </Button>
    </form>
  );
}
