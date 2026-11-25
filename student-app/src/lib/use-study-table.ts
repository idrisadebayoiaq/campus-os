import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/src/lib/auth";
import {
  getCached,
  isLocalId,
  isNetworkError,
  localId,
  scopedKey,
  setCached,
} from "@/src/lib/offline";
import { supabase, supabaseConfigured } from "@/src/lib/supabase";

export type StudyRow = {
  id: string;
  _pending?: boolean;
  [key: string]: unknown;
};

type Options = {
  table: string;
  cacheKey: string;
  orderBy?: { column: string; ascending?: boolean };
  /** Delay loading until true (e.g. waiting on a parent table to sync). */
  enabled?: boolean;
  /** Transform a pending row before insert. Return null to skip syncing for now. */
  prepareInsert?: (row: StudyRow) => Record<string, unknown> | null;
  /** Called after a local row is replaced by its server row. */
  onSynced?: (localRowId: string, serverRow: StudyRow, userId: string) => void | Promise<void>;
  /** Set false for tables that don't exist remotely (local only). */
  remote?: boolean;
};

type InsertResult<T> =
  | { skipped: true }
  | { error: { message: string; code?: string } }
  | { row: T };

function stripLocal(row: StudyRow) {
  const { id: _id, _pending, user_id: _uid, created_at: _c, ...rest } = row;
  void _id;
  void _pending;
  void _uid;
  void _c;
  return rest;
}

/**
 * Offline-first list for a Supabase table.
 * - Shows cached rows immediately, then refreshes when online.
 * - Creates are saved locally first (`_pending`) and synced on the next
 *   successful load/add when connectivity returns.
 */
export function useStudyTable<T extends StudyRow = StudyRow>(opts: Options) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const key = scopedKey(opts.cacheKey, userId);
  const enabled = opts.enabled ?? true;
  const remote = opts.remote ?? true;

  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [synced, setSynced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemsRef = useRef<T[]>([]);
  const inflight = useRef(new Set<string>());
  const mounted = useRef(true);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const commit = useCallback(
    async (next: T[]) => {
      itemsRef.current = next;
      if (mounted.current) setItems(next);
      await setCached(key, next);
    },
    [key],
  );

  const insertRemote = useCallback(
    async (row: T): Promise<InsertResult<T>> => {
      const o = optsRef.current;
      const prepared = o.prepareInsert ? o.prepareInsert(row) : stripLocal(row);
      if (!prepared) return { skipped: true };
      const { data, error: err } = await supabase
        .from(o.table)
        .insert({ ...prepared, user_id: userId })
        .select()
        .single();
      if (err) return { error: err };
      return { row: data as T };
    },
    [userId],
  );

  const load = useCallback(
    async (isRefresh = false) => {
      if (!enabled) return;
      if (isRefresh) setRefreshing(true);
      const cached = await getCached<T[]>(key, []);
      if (itemsRef.current.length === 0 || isRefresh) {
        itemsRef.current = cached;
        if (mounted.current) setItems(cached);
      }
      if (mounted.current) setLoading(false);

      if (!remote || !userId || !supabaseConfigured) {
        if (mounted.current) {
          setRefreshing(false);
          setSynced(true);
        }
        return;
      }

      try {
        // 1. Push pending rows
        const pendingRows = itemsRef.current.filter(
          (r) => r._pending && !inflight.current.has(r.id),
        );
        const syncedIds = new Set<string>();
        let syncFailed: string | null = null;
        for (const row of pendingRows) {
          inflight.current.add(row.id);
          try {
            const res = await insertRemote(row);
            if ("skipped" in res) continue;
            if ("error" in res) {
              if (isNetworkError(res.error)) throw res.error;
              // Server rejected it — drop so it can't block the queue forever.
              syncedIds.add(row.id);
              syncFailed = res.error.message;
              continue;
            }
            syncedIds.add(row.id);
            await optsRef.current.onSynced?.(row.id, res.row, userId);
          } finally {
            inflight.current.delete(row.id);
          }
        }

        // 2. Fetch fresh server rows
        let q = supabase.from(optsRef.current.table).select("*").eq("user_id", userId);
        const ob = optsRef.current.orderBy;
        q = q.order(ob?.column ?? "created_at", { ascending: ob?.ascending ?? false });
        const { data, error: err } = await q.limit(500);
        if (err) throw err;

        const stillPending = itemsRef.current.filter(
          (r) => r._pending && !syncedIds.has(r.id),
        );
        await commit([...stillPending, ...((data ?? []) as T[])]);
        if (mounted.current) {
          setOffline(false);
          setError(syncFailed);
        }
      } catch (e) {
        if (mounted.current) {
          if (isNetworkError(e)) {
            setOffline(true);
            setError(null);
          } else {
            setError(e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Could not refresh.");
          }
        }
      } finally {
        if (mounted.current) {
          setRefreshing(false);
          setSynced(true);
        }
      }
    },
    [enabled, key, remote, userId, insertRemote, commit],
  );

  // Switching accounts must never show the previous user's rows.
  const lastKey = useRef(key);
  if (lastKey.current !== key) {
    lastKey.current = key;
    itemsRef.current = [];
  }

  useEffect(() => {
    void load(false);
  }, [load]);

  const add = useCallback(
    async (draft: Record<string, unknown>): Promise<{ error: string | null; queued?: boolean }> => {
      const local = {
        ...draft,
        id: localId(),
        user_id: userId ?? undefined,
        created_at: new Date().toISOString(),
        _pending: remote,
      } as unknown as T;
      await commit([local, ...itemsRef.current]);

      if (!remote || !userId || !supabaseConfigured) {
        return { error: null, queued: true };
      }

      inflight.current.add(local.id);
      try {
        const res = await insertRemote(local);
        if ("skipped" in res) return { error: null, queued: true };
        if ("error" in res) {
          if (isNetworkError(res.error)) {
            if (mounted.current) setOffline(true);
            return { error: null, queued: true };
          }
          await commit(itemsRef.current.filter((r) => r.id !== local.id));
          return { error: res.error.message };
        }
        await commit(itemsRef.current.map((r) => (r.id === local.id ? res.row : r)));
        await optsRef.current.onSynced?.(local.id, res.row, userId);
        if (mounted.current) setOffline(false);
        return { error: null };
      } catch (e) {
        if (isNetworkError(e)) {
          if (mounted.current) setOffline(true);
          return { error: null, queued: true };
        }
        await commit(itemsRef.current.filter((r) => r.id !== local.id));
        return { error: e instanceof Error ? e.message : "Could not save." };
      } finally {
        inflight.current.delete(local.id);
      }
    },
    [commit, insertRemote, remote, userId],
  );

  const update = useCallback(
    async (id: string, patch: Record<string, unknown>): Promise<{ error: string | null }> => {
      const prev = itemsRef.current;
      const next = prev.map((r) => (r.id === id ? ({ ...r, ...patch } as T) : r));
      if (isLocalId(id) || !remote || !userId) {
        await commit(next);
        return { error: null };
      }
      await commit(next);
      try {
        const { error: err } = await supabase
          .from(optsRef.current.table)
          .update(patch)
          .eq("id", id)
          .eq("user_id", userId);
        if (err) throw err;
        return { error: null };
      } catch (e) {
        await commit(prev);
        return {
          error: isNetworkError(e)
            ? "You're offline — this change needs a connection."
            : e instanceof Error
              ? e.message
              : (e as { message?: string })?.message ?? "Could not update.",
        };
      }
    },
    [commit, remote, userId],
  );

  const remove = useCallback(
    async (id: string): Promise<{ error: string | null }> => {
      const prev = itemsRef.current;
      if (isLocalId(id) || !remote || !userId) {
        await commit(prev.filter((r) => r.id !== id));
        return { error: null };
      }
      try {
        const { error: err } = await supabase
          .from(optsRef.current.table)
          .delete()
          .eq("id", id)
          .eq("user_id", userId);
        if (err) throw err;
        await commit(itemsRef.current.filter((r) => r.id !== id));
        return { error: null };
      } catch (e) {
        return {
          error: isNetworkError(e)
            ? "You're offline — deleting needs a connection."
            : e instanceof Error
              ? e.message
              : (e as { message?: string })?.message ?? "Could not delete.",
        };
      }
    },
    [commit, remote, userId],
  );

  const refresh = useCallback(() => load(true), [load]);

  return {
    items,
    loading,
    refreshing,
    offline,
    synced,
    error,
    pendingCount: items.filter((r) => r._pending).length,
    add,
    update,
    remove,
    refresh,
  };
}
