import type { ReactNode } from "react";

/** Lightweight phone frame used to preview app screens on the landing page. */
export function PhoneMock({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`w-full max-w-[17rem] rounded-[2.4rem] bg-[#1a1428] p-2.5 shadow-[0_30px_80px_rgba(60,49,91,0.35)] ring-1 ring-white/10 ${className}`}
    >
      <div className="overflow-hidden rounded-[1.9rem] bg-[#fffdf8] text-[#2a2140]">
        <div className="flex items-center justify-between px-4 pt-3 text-[10px] font-semibold text-[#2a2140]/60">
          <span>9:41</span>
          <span className="h-1.5 w-12 rounded-full bg-[#2a2140]/15" />
          <span>100%</span>
        </div>
        <div className="bg-[#3c315b] px-4 pb-4 pt-3 text-white">
          <p className="text-[10px] uppercase tracking-wider text-white/60">CampusOS</p>
          <p className="text-base font-semibold">{title}</p>
        </div>
        <div className="space-y-2 p-3 pb-4">{children}</div>
        <div className="flex justify-around border-t border-[#2a2140]/10 bg-white py-2.5">
          {["Home", "Study", "Market", "Inbox", "Me"].map((tab, i) => (
            <span
              key={tab}
              className={`text-[9px] font-semibold ${
                i === 0 ? "text-[#7c6cd6]" : "text-[#2a2140]/40"
              }`}
            >
              {tab}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MockRow({
  title,
  meta,
  badge,
}: {
  title: string;
  meta: string;
  badge?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-[#e2dffe]/60 px-3 py-2.5">
      <span className="h-9 w-9 shrink-0 rounded-xl bg-[#ab9ff2]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold">{title}</p>
        <p className="truncate text-[10px] text-[#2a2140]/60">{meta}</p>
      </div>
      {badge ? (
        <span className="rounded-full bg-[#3c315b] px-2 py-0.5 text-[9px] font-semibold text-white">
          {badge}
        </span>
      ) : null}
    </div>
  );
}

export function MockBubble({ mine, children }: { mine?: boolean; children: ReactNode }) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <p
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-[11px] leading-4 ${
          mine ? "bg-[#3c315b] text-white" : "bg-[#e2dffe] text-[#2a2140]"
        }`}
      >
        {children}
      </p>
    </div>
  );
}
