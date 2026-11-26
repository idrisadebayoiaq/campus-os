"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type AdminUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  roles: string[];
};

const ASSIGNABLE = ["admin", "moderator", "provider", "vendor", "lecturer", "school_admin"] as const;

export function AdminUserManager({
  users,
  currentUserId,
  canManage,
}: {
  users: AdminUserRow[];
  currentUserId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setRole(userId: string, role: string, grant: boolean) {
    setBusy(`${userId}:${role}`);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("admin_set_user_role", {
      target: userId,
      new_role: role,
      grant_role: grant,
    });
    setBusy(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-2xl border border-danger/30 bg-surface px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
        {users.map((u) => (
          <div key={u.id} className="space-y-3 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {u.full_name || u.email}
                  {u.id === currentUserId ? (
                    <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold">
                      You
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted">{u.email}</p>
              </div>
              <p className="text-xs text-muted">
                Joined {new Date(u.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {ASSIGNABLE.map((role) => {
                const has = u.roles.includes(role);
                const locked = !canManage || (role === "admin" && has && u.id === currentUserId);
                return (
                  <button
                    key={role}
                    type="button"
                    disabled={locked || busy === `${u.id}:${role}`}
                    onClick={() => setRole(u.id, role, !has)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                      has
                        ? "bg-accent text-on-accent"
                        : "border border-border text-muted hover:bg-surface hover:text-fg"
                    }`}
                  >
                    {has ? "✓ " : "+ "}
                    {role.replace("_", " ")}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
