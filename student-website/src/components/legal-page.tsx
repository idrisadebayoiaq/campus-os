import Link from "next/link";
import type { LegalDoc } from "@/lib/legal";

function slug(title: string) {
  return title
    .toLowerCase()
    .replace(/^\d+\.\s*/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function LegalPage({
  doc,
  other,
}: {
  doc: LegalDoc;
  other: { href: string; label: string };
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="rounded-3xl bg-hero-bg px-6 py-8 text-hero-fg sm:px-10 sm:py-12">
        <p className="text-sm font-medium text-hero-muted">CampusOS · Legal</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{doc.title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-hero-muted sm:text-base">
          {doc.intro}
        </p>
        <p className="mt-4 text-xs text-hero-muted">Last updated {doc.updated}</p>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav className="hidden lg:block" aria-label="Sections">
          <div className="sticky top-20 space-y-1 rounded-2xl border border-border p-3">
            {doc.sections.map((s) => (
              <a
                key={s.title}
                href={`#${slug(s.title)}`}
                className="block rounded-xl px-3 py-2 text-sm text-muted hover:bg-surface hover:text-fg"
              >
                {s.title.replace(/^\d+\.\s*/, "")}
              </a>
            ))}
          </div>
        </nav>

        <div className="min-w-0 space-y-4">
          {doc.sections.map((s) => (
            <section
              key={s.title}
              id={slug(s.title)}
              className="scroll-mt-20 rounded-2xl border border-border bg-surface/50 p-5 sm:p-6"
            >
              <h2 className="text-lg font-semibold text-fg">{s.title}</h2>
              <ul className="mt-3 space-y-2.5">
                {s.body.map((p) => (
                  <li key={p} className="flex gap-3 text-sm leading-6 text-muted">
                    <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <Link
            href={other.href}
            className="flex items-center justify-between rounded-2xl border border-border px-5 py-4 text-sm font-medium text-fg hover:border-accent"
          >
            Read the {other.label}
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
