"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { CampusSceneMode } from "./campus-scene-canvas";

const CampusSceneCanvas = dynamic(
  () =>
    import("./campus-scene-canvas").then((mod) => mod.CampusSceneCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-surface text-sm text-muted">
        Loading CampusOS 3D map…
      </div>
    ),
  },
);

const CAPTIONS: Record<CampusSceneMode, string> = {
  overview: "Illustrative campus layout for service zoning.",
  housing: "Housing zone context when publishing rooms near campus.",
  zones: "Food and service catchment around campus.",
  business: "Where student demand concentrates — gate, food, and market zones.",
};

export function CampusScene({
  mode = "business",
  title = "Campus service map",
  className = "",
  heightClass = "h-56 sm:h-72",
  defaultOpen = true,
}: {
  mode?: CampusSceneMode;
  title?: string;
  className?: string;
  heightClass?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`overflow-hidden rounded-md border border-border ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-0.5 text-xs text-muted">CampusOS Portal · React Three Fiber</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-border bg-bg px-3 py-1.5 text-xs font-medium hover:bg-surface"
        >
          {open ? "Hide 3D" : "Show 3D"}
        </button>
      </div>
      {open ? (
        <div className={`relative w-full bg-bg ${heightClass}`}>
          <CampusSceneCanvas mode={mode} />
        </div>
      ) : (
        <div className="bg-surface px-4 py-6 text-sm text-muted">
          3D map hidden. Turn it on when you need campus zone context.
        </div>
      )}
      <p className="border-t border-border bg-surface px-4 py-2 text-xs text-muted">
        {CAPTIONS[mode]} Illustrative only — listings stay campus-scoped in data.
      </p>
    </section>
  );
}
