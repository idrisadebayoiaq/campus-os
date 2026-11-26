import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useAuth } from "@/src/lib/auth";
import { supabase } from "@/src/lib/supabase";

export type PremiumInfo = {
  active: boolean;
  price: number;
  /** True until the first answer arrives */
  loading: boolean;
  refresh: () => Promise<void>;
};

/** Whether the signed-in student has active Premium, and what it costs them. Re-reads on screen focus. */
export function usePremium(): PremiumInfo {
  const { user } = useAuth();
  const [active, setActive] = useState(false);
  const [price, setPrice] = useState(2000);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setActive(false);
      setLoading(false);
      return;
    }
    try {
      const { data } = await supabase.rpc("my_premium_state");
      if (data) {
        const s = data as { active?: boolean; price?: number };
        setActive(Boolean(s.active));
        if (typeof s.price === "number") setPrice(s.price);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return { active, price, loading, refresh };
}
