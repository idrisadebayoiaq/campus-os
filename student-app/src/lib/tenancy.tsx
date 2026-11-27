import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import { useAuth } from "@/src/lib/auth";
import { supabase } from "@/src/lib/supabase";

export type ActiveTenancy = {
  id: string;
  unit_id: string;
  rent_amount: number;
  rent_period: string;
  start_date: string;
  end_date: string | null;
  next_due_on: string | null;
  status: string;
  business_id: string;
};

type TenancyContextValue = {
  /** The house the student currently lives in (keys collected / tenancy active), if any. */
  tenancy: ActiveTenancy | null;
  hasActiveHome: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
};

const TenancyContext = createContext<TenancyContextValue>({
  tenancy: null,
  hasActiveHome: false,
  loading: true,
  refresh: async () => undefined,
});

export function TenancyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tenancy, setTenancy] = useState<ActiveTenancy | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setTenancy(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("tenancies")
      .select("id, unit_id, rent_amount, rent_period, start_date, end_date, next_due_on, status, business_id")
      .eq("student_id", user.id)
      .eq("status", "active")
      .order("start_date", { ascending: false })
      .limit(1);
    setTenancy(((data ?? [])[0] as ActiveTenancy | undefined) ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Pick up changes the agent makes (handover, tenancy ended) without needing a restart.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`tenancy-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tenancies", filter: `student_id=eq.${user.id}` },
        () => void refresh(),
      )
      .subscribe();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void refresh();
    });
    return () => {
      sub.remove();
      void supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  const value = useMemo(
    () => ({ tenancy, hasActiveHome: Boolean(tenancy), loading, refresh }),
    [tenancy, loading, refresh],
  );
  return <TenancyContext.Provider value={value}>{children}</TenancyContext.Provider>;
}

export function useTenancy() {
  return useContext(TenancyContext);
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const due = new Date(`${iso}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}
