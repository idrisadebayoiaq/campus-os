import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-5xl px-4 sm:px-6 ${className}`}>{children}</div>
  );
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
      ? "bg-inverse-bg text-inverse-fg hover:opacity-90"
      : variant === "secondary"
        ? "border border-border bg-bg text-fg hover:bg-surface"
        : "text-fg hover:bg-surface";

  return (
    <button
      className={`inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-medium transition disabled:opacity-50 ${styles} ${className}`}
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
      ? "bg-inverse-bg text-inverse-fg hover:opacity-90"
      : variant === "secondary"
        ? "border border-border bg-bg text-fg hover:bg-surface"
        : "text-fg hover:bg-surface";

  return (
    <Link
      href={href}
      className={`inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-medium transition ${styles} ${className}`}
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
      className={`h-11 w-full rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none placeholder:text-muted focus:border-fg ${className}`}
      {...props}
    />
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
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-2 border-b border-border pb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
        {title}
      </h1>
      {description ? <p className="max-w-2xl text-sm text-muted sm:text-base">{description}</p> : null}
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
    <div className="rounded-md border border-dashed border-border bg-surface px-6 py-12 text-center">
      <p className="font-medium text-fg">{title}</p>
      <p className="mt-2 text-sm text-muted">{description}</p>
    </div>
  );
}
