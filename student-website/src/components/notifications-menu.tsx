"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { NavIcon } from "@/components/nav-icons";
import { createClient } from "@/lib/supabase/client";

type Notification = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean | null;
  created_at: string;
};

export function NotificationsMenu({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("notifications")
        .select("id, title, body, link, is_read, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(12);
      if (!cancelled) setItems(data || []);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const unread = items.filter((n) => !n.is_read).length;

  async function markRead(id: string) {
    const supabase = createClient();
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-bg hover:bg-surface"
      >
        <NavIcon name="bell" className="h-4 w-4" />
        {unread ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-inverse-bg px-1 text-[10px] font-medium text-inverse-fg">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-md border border-border bg-bg shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-sm font-medium">Notifications</p>
            <Link href="/inbox" className="text-xs text-muted hover:text-fg" onClick={() => setOpen(false)}>
              Open inbox
            </Link>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {!items.length ? (
              <p className="px-3 py-6 text-sm text-muted">No notifications yet.</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="block w-full border-b border-border px-3 py-3 text-left hover:bg-surface"
                  onClick={() => {
                    void markRead(item.id);
                    setOpen(false);
                    if (item.link) window.location.href = item.link;
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{item.title}</p>
                    {!item.is_read ? <span className="mt-1 h-2 w-2 rounded-full bg-fg" /> : null}
                  </div>
                  {item.body ? <p className="mt-1 line-clamp-2 text-xs text-muted">{item.body}</p> : null}
                  <p className="mt-1 text-[11px] text-muted">
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
