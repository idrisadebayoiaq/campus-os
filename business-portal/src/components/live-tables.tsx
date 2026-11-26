"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/** Re-renders the server page whenever a row in one of the tables changes. */
export function LiveTables({ tables, channel }: { tables: string[]; channel: string }) {
  const router = useRouter();
  const key = tables.join(",");
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let sub = supabase.channel(channel);
    for (const table of key.split(",")) {
      sub = sub.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => router.refresh(), 400);
      });
    }
    sub.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(sub);
    };
  }, [key, channel, router]);
  return null;
}

/** Small "Verified student" tick shown beside a student's name. */
export function VerifiedBadge({ verified }: { verified: boolean }) {
  if (!verified) {
    return (
      <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted">
        Not verified
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-on-accent">
      <svg viewBox="0 0 20 20" className="h-3 w-3" fill="currentColor" aria-hidden>
        <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7 7a1 1 0 0 1-1.4 0l-3-3a1 1 0 1 1 1.4-1.4L9 11.6l6.3-6.3a1 1 0 0 1 1.4 0Z" />
      </svg>
      Verified student
    </span>
  );
}
