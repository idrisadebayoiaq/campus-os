"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

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
    router.push(next && next.startsWith("/") ? next : "/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Work email">
        <Input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@business.com"
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

export function SignupForm({
  intent = "business",
  redirectTo = "/dashboard",
}: {
  intent?: "business" | "lecturer" | "school" | "support";
  redirectTo?: string;
} = {}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("full_name") || "");
    const email = String(form.get("email") || "");
    const password = String(form.get("password") || "");
    if (form.get("terms") !== "on") {
      setLoading(false);
      setError("Please agree to the Terms of Service and Privacy Policy.");
      return;
    }
    if (password.length < 8) {
      setLoading(false);
      setError("Use a password with at least 8 characters.");
      return;
    }
    const supabase = createClient();

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, signup_intent: intent },
      },
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (!data.session) {
      setMessage("Check your email to confirm your account, then log in.");
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Full name">
        <Input
          name="full_name"
          required
          autoComplete="name"
          placeholder={intent === "business" ? "Business owner name" : "Your full name"}
        />
      </Field>
      <Field label="Work email">
        <Input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@business.com"
        />
      </Field>
      <Field label="Password">
        <PasswordField
          name="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
        />
      </Field>
      <label className="flex items-start gap-3 rounded-2xl border border-border bg-surface/60 p-3 text-sm text-muted">
        <input name="terms" type="checkbox" className="mt-0.5" required />
        <span>
          I agree to the CampusOS{" "}
          <Link href="/terms" target="_blank" className="font-medium text-fg underline underline-offset-2">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" target="_blank" className="font-medium text-fg underline underline-offset-2">
            Privacy Policy
          </Link>
          {intent === "business" ? (
            <>
              , and the{" "}
              <Link
                href="/business-rules"
                target="_blank"
                className="font-medium text-fg underline underline-offset-2"
              >
                Business rules
              </Link>
            </>
          ) : null}
          .
        </span>
      </label>
      {error ? (
        <p className="rounded-md border border-danger/30 bg-surface px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-md border border-success/30 bg-surface px-3 py-2 text-sm text-success">
          {message}
        </p>
      ) : null}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
