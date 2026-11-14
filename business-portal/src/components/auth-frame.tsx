import Link from "next/link";
import type { ReactNode } from "react";
import { CampusLogo } from "@/components/campus-logo";

export function AuthFrame({
  eyebrow,
  title,
  description,
  children,
  footer,
  panelTitle = "Grow your campus business",
  panelBody = "Apply as a housing provider or vendor, manage listings, and serve students on CampusOS.",
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  panelTitle?: string;
  panelBody?: string;
}) {
  return (
    <div className="relative min-h-[calc(100dvh-3.5rem)] lg:min-h-dvh">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(10,10,10,0.05),_transparent_50%),radial-gradient(ellipse_at_bottom_right,_rgba(10,10,10,0.04),_transparent_45%)] dark:bg-[radial-gradient(ellipse_at_top_left,_rgba(250,250,250,0.06),_transparent_50%),radial-gradient(ellipse_at_bottom_right,_rgba(250,250,250,0.04),_transparent_45%)]"
      />

      <div className="relative mx-auto grid min-h-[inherit] w-full max-w-6xl lg:grid-cols-2">
        <aside className="hidden flex-col justify-between border-r border-border bg-surface/60 px-10 py-12 lg:flex">
          <CampusLogo href="/login" size={40} />
          <div className="space-y-4">
            <p className="text-sm font-medium tracking-wide text-muted">CampusOS Portal</p>
            <h2 className="max-w-sm text-3xl font-semibold tracking-tight text-fg">
              {panelTitle}
            </h2>
            <p className="max-w-sm text-sm leading-6 text-muted">{panelBody}</p>
          </div>
          <p className="text-xs text-muted">
            Business portal ·{" "}
            <Link href="/business-rules" className="underline underline-offset-2">
              Business rules
            </Link>
          </p>
        </aside>

        <section className="flex items-center px-4 py-10 sm:px-8 lg:px-12">
          <div className="mx-auto w-full max-w-md space-y-8">
            <div className="space-y-4 lg:hidden">
              <CampusLogo href="/login" size={36} />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-muted">{eyebrow}</p>
              <h1 className="text-3xl font-semibold tracking-tight text-fg">{title}</h1>
              <p className="text-sm leading-6 text-muted">{description}</p>
            </div>

            <div className="rounded-2xl border border-border bg-bg/80 p-5 shadow-sm sm:p-6">
              {children}
            </div>

            {footer ? <div className="space-y-3 text-sm text-muted">{footer}</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
