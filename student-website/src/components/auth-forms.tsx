"use client";

import Link from "next/link";
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
  return "/dashboard";
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

export function SignupForm() {
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
    const firstName = String(form.get("first_name") || "").trim();
    const lastName = String(form.get("last_name") || "").trim();
    const preferredName = String(form.get("preferred_name") || "").trim();
    const email = String(form.get("email") || "");
    const password = String(form.get("password") || "");
    const terms = form.get("terms") === "on";
    const privacy = form.get("privacy") === "on";
    const marketing = form.get("marketing") === "on";

    if (!terms || !privacy) {
      setLoading(false);
      setError("Accept the Terms and Privacy notice to create a CampusOS account.");
      return;
    }

    const fullName = `${firstName} ${lastName}`.trim();
    const supabase = createClient();

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          first_name: firstName,
          last_name: lastName,
          preferred_name: preferredName || null,
        },
      },
    });

    if (signUpError) {
      setLoading(false);
      setError(signUpError.message);
      return;
    }

    if (data.user) {
      await supabase.from("profiles").upsert({
        id: data.user.id,
        full_name: fullName,
        first_name: firstName,
        last_name: lastName,
        preferred_name: preferredName || null,
      });

      const consents = [
        { purpose: "terms_of_service", version: "2026-11", granted: true },
        { purpose: "privacy_notice", version: "2026-11", granted: true },
        { purpose: "marketing", version: "2026-11", granted: marketing },
      ];
      await supabase.from("user_consents").insert(
        consents.map((c) => ({
          user_id: data.user!.id,
          ...c,
        })),
      );

      await supabase.from("onboarding_progress").upsert({
        user_id: data.user.id,
        current_step: "status",
        setup_tasks: ["add_courses", "add_timetable", "set_housing_budget", "set_study_goal"],
      });
      await supabase.from("student_profiles").upsert({ user_id: data.user.id });
      await supabase.from("student_preferences").upsert({ user_id: data.user.id });
      await supabase.from("notification_preferences").upsert({
        user_id: data.user.id,
        marketing_email: marketing,
      });
    }

    setLoading(false);

    if (!data.session) {
      setMessage("Check your email to confirm your account, then log in.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name">
          <Input name="first_name" required autoComplete="given-name" placeholder="Ada" />
        </Field>
        <Field label="Last name">
          <Input name="last_name" required autoComplete="family-name" placeholder="Okonkwo" />
        </Field>
      </div>
      <Field label="Preferred name (optional)">
        <Input
          name="preferred_name"
          autoComplete="nickname"
          placeholder="What should CampusOS call you?"
        />
      </Field>
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
        <PasswordField
          name="password"
          autoComplete="new-password"
          placeholder="At least 6 characters"
        />
      </Field>

      <div className="space-y-3 rounded-xl border border-border bg-surface/60 p-3">
        <label className="flex items-start gap-2.5 text-sm text-muted">
          <input name="terms" type="checkbox" className="mt-1" required />
          <span>
            I agree to the CampusOS{" "}
            <Link href="/terms" className="text-fg underline underline-offset-2">
              Terms of Service
            </Link>
            .
          </span>
        </label>
        <label className="flex items-start gap-2.5 text-sm text-muted">
          <input name="privacy" type="checkbox" className="mt-1" required />
          <span>
            I acknowledge the CampusOS{" "}
            <Link href="/privacy" className="text-fg underline underline-offset-2">
              Privacy notice
            </Link>
            .
          </span>
        </label>
        <label className="flex items-start gap-2.5 text-sm text-muted">
          <input name="marketing" type="checkbox" className="mt-1" />
          <span>Send me optional CampusOS tips and offers (not required).</span>
        </label>
      </div>

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
