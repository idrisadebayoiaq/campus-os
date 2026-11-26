import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "@/src/lib/supabase";

export type SignUpProfile = {
  firstName: string;
  lastName: string;
  preferredName?: string;
  marketing?: boolean;
  location?: { label: string; lat: number; lng: number } | null;
};

const CONSENT_VERSION = "2026-11";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    profile: SignUpProfile,
  ) => Promise<{ error: string | null; needsConfirm?: boolean }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function boot() {
      if (!supabaseConfigured) {
        if (active) setLoading(false);
        return;
      }
      try {
        const { data } = await supabase.auth.getSession();
        if (active) setSession(data.session);
      } catch {
        if (active) setSession(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    void boot();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) setSession(next);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      configured: supabaseConfigured,
      async signIn(email, password) {
        try {
          const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          return { error: error?.message ?? null };
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Sign in failed. Try again.",
          };
        }
      },
      async signUp(email, password, profile) {
        try {
          const firstName = profile.firstName.trim();
          const lastName = profile.lastName.trim();
          const preferredName = profile.preferredName?.trim() || null;
          const marketing = Boolean(profile.marketing);
          const fullName = `${firstName} ${lastName}`.trim();

          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: fullName,
                first_name: firstName,
                last_name: lastName,
                preferred_name: preferredName,
                signup_intent: "student",
                location_label: profile.location?.label ?? null,
                location_lat: profile.location?.lat ?? null,
                location_lng: profile.location?.lng ?? null,
              },
            },
          });
          if (error) return { error: error.message };
          if (data.user) {
            // Best-effort profile rows — never block signup on these.
            const uid = data.user.id;
            const now = new Date().toISOString();
            const writes = [
              () =>
                supabase.from("profiles").upsert({
                  id: uid,
                  full_name: fullName,
                  first_name: firstName,
                  last_name: lastName,
                  preferred_name: preferredName,
                }),
              () => supabase.from("student_profiles").upsert({ user_id: uid }),
              () =>
                supabase
                  .from("student_preferences")
                  .upsert({ user_id: uid, interests: [] }),
              () =>
                supabase.from("notification_preferences").upsert({
                  user_id: uid,
                  academic_reminders: true,
                  lecture_alerts: true,
                  examination_alerts: true,
                  housing_alerts: true,
                  food_order_updates: true,
                  marketing_email: marketing,
                  updated_at: now,
                }),
              () =>
                supabase.from("user_consents").insert(
                  [
                    { purpose: "terms_of_service", granted: true },
                    { purpose: "privacy_notice", granted: true },
                    ...(marketing ? [{ purpose: "marketing", granted: true }] : []),
                  ].map((c) => ({
                    user_id: uid,
                    version: CONSENT_VERSION,
                    ...c,
                  })),
                ),
              () =>
                supabase.from("onboarding_progress").upsert({
                  user_id: uid,
                  current_step: "status",
                  setup_tasks: [
                    "add_courses",
                    "add_timetable",
                    "set_housing_budget",
                    "set_study_goal",
                  ],
                }),
            ];
            for (const write of writes) {
              try {
                await write();
              } catch {
                /* ignore individual write failures */
              }
            }
          }
          return {
            error: null,
            needsConfirm: !data.session,
          };
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Sign up failed. Try again.",
          };
        }
      },
      async signOut() {
        try {
          await supabase.auth.signOut();
        } catch {
          /* still clear local session via listener */
        }
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
