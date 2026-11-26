import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`mx-auto w-full max-w-5xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
}) {
  const styles =
    variant === "primary"
      ? "bg-accent text-on-accent hover:opacity-90"
      : variant === "secondary"
        ? "border border-border bg-bg text-fg hover:bg-surface"
        : "text-fg hover:bg-surface";

  return (
    <button
      className={`inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-sm font-medium transition disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  const styles =
    variant === "primary"
      ? "bg-accent text-on-accent hover:opacity-90"
      : variant === "secondary"
        ? "border border-border bg-bg text-fg hover:bg-surface"
        : "text-fg hover:bg-surface";

  return (
    <Link
      href={href}
      className={`inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-sm font-medium transition ${styles} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-11 w-full rounded-2xl border border-border bg-bg px-3 text-sm text-fg outline-none placeholder:text-muted focus:border-accent ${className}`}
      {...props}
    />
  );
}

/** Green "Premium" badge shown next to the name of every Premium account. */
export function PremiumBadge({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span
      title="CampusOS Premium"
      className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-[#16a34a] px-2 py-0.5 text-[11px] font-semibold leading-4 text-white ${className}`}
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3.5 8.5l3 3 6-7" />
      </svg>
      {compact ? null : "Premium"}
    </span>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1.5 block text-sm font-medium text-fg">{children}</label>;
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  subtitle,
}: {
  title: string;
  description?: string;
  subtitle?: string;
}) {
  description = description ?? subtitle;
  return (
    <div className="space-y-2 border-b border-border pb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
        {title}
      </h1>
      {description ? (
        <p className="max-w-2xl text-sm text-muted sm:text-base">{description}</p>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center">
      <p className="font-medium text-fg">{title}</p>
      <p className="mt-2 text-sm text-muted">{description}</p>
    </div>
  );
}
