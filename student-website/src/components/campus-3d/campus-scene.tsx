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
  overview: "Illustrative campus layout — gate, lecture area, hostels, food, and market zones.",
  housing: "Housing focus: nearby hostel/off-campus zone (approximate, not a street address).",
  zones: "Campus service zones students use on CampusOS.",
  business: "Where campus businesses serve students — market and food zones highlighted conceptually.",
};

export function CampusScene({
  mode = "overview",
  title = "Campus map",
  className = "",
  heightClass = "h-64 sm:h-80",
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
          <p className="mt-0.5 text-xs text-muted">CampusOS · React Three Fiber preview</p>
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
          3D map hidden to save battery/data. Turn it back on anytime.
        </div>
      )}
      <p className="border-t border-border bg-surface px-4 py-2 text-xs text-muted">
        {CAPTIONS[mode]} Drag to orbit. Not a GPS map — use listing maps for real locations.
      </p>
    </section>
  );
}
