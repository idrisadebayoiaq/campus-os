import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * AsyncStorage-backed offline cache for Study Hub.
 * No NetInfo dependency: "offline" is detected from failed network calls.
 */
export const CACHE_KEYS = {
  courses: "study:courses",
  timetable: "study:timetable",
  grades: "study:grades",
  assignments: "study:assignments",
  notes: "study:notes",
  flashcards: "study:flashcards",
  focus: "study:focus",
  aiHistory: "study:ai-history",
  // Additional tools
  exams: "study:exams",
  calendar: "study:calendar",
  planner: "study:planner",
  pastQuestions: "study:past-questions",
  cbt: "study:cbt",
  flashcardDecks: "study:flashcard-decks",
  groups: "study:groups",
  tutors: "study:tutors",
} as const;

export type StudyCacheKey = (typeof CACHE_KEYS)[keyof typeof CACHE_KEYS];

/** Scope a cache key to a user so accounts never share offline data. */
export function scopedKey(key: string, userId?: string | null) {
  return userId ? `${key}:${userId}` : key;
}

export async function getCached<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function setCached<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable — cache is best effort */
  }
}

/**
 * Merge `incoming` rows into the cached array by `idKey`.
 * Incoming rows win; cached rows not in `incoming` are kept.
 */
export async function mergeCached<T extends Record<string, unknown>>(
  key: string,
  incoming: T[],
  idKey: keyof T & string = "id",
): Promise<T[]> {
  const existing = await getCached<T[]>(key, []);
  const map = new Map<unknown, T>();
  for (const row of existing) map.set(row[idKey], row);
  for (const row of incoming) map.set(row[idKey], { ...map.get(row[idKey]), ...row });
  const merged = Array.from(map.values());
  await setCached(key, merged);
  return merged;
}

export async function removeCached(key: string) {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** True when an error looks like a connectivity failure rather than a server rejection. */
export function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { message?: string; code?: string; status?: number };
  if (e.status && e.status >= 400 && e.status < 500) return false;
  if (e.code && /^(PGRST\d+|[0-9A-Z]{5})$/.test(e.code)) return false; // Postgres / PostgREST code
  const msg = String(e.message ?? err);
  return /network|fetch|timeout|timed out|offline|abort|connection|failed to/i.test(msg) || !e.code;
}

export type OfflineFirstResult<T> = {
  data: T;
  source: "online" | "cache";
  offline: boolean;
  error: string | null;
};

/**
 * Return cached data immediately via `onCache`, then refresh from the network.
 * If the refresh fails the cached data is returned and `offline` is set when
 * the failure looks like a connectivity problem.
 */
export async function withOfflineFirst<T>(
  loadOnline: () => Promise<T>,
  cacheKey: string,
  options: {
    fallback: T;
    onCache?: (cached: T) => void;
    /** Skip the network (not signed in / not configured) */
    skipOnline?: boolean;
  },
): Promise<OfflineFirstResult<T>> {
  const cached = await getCached<T>(cacheKey, options.fallback);
  options.onCache?.(cached);

  if (options.skipOnline) {
    return { data: cached, source: "cache", offline: false, error: null };
  }

  try {
    const fresh = await loadOnline();
    await setCached(cacheKey, fresh);
    return { data: fresh, source: "online", offline: false, error: null };
  } catch (e) {
    const offline = isNetworkError(e);
    return {
      data: cached,
      source: "cache",
      offline,
      error: offline ? null : e instanceof Error ? e.message : "Could not refresh.",
    };
  }
}

export function localId(prefix = "local") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isLocalId(id: string) {
  return id.startsWith("local-");
}
