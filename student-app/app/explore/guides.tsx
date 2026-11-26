import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { AppText, EmptyState } from "@/src/components/ui";
import { StudyShell, SyncBanner } from "@/src/components/study";
import { useAuth } from "@/src/lib/auth";
import { getStudentCampus } from "@/src/lib/campus";
import { getCached, scopedKey, setCached } from "@/src/lib/offline";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type Guide = {
  id: string;
  title: string;
  summary: string | null;
  body: string | null;
  slug?: string | null;
};

export default function GuidesScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const [items, setItems] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    const key = scopedKey("explore:guides", user.id);
    const cached = await getCached<Guide[]>(key, []);
    if (cached.length) setItems(cached);

    try {
      const campus = await getStudentCampus(supabase, user.id);
      let query = supabase
        .from("campus_guides")
        .select("id, title, summary, body, slug")
        .order("created_at", { ascending: false })
        .limit(40);
      if (campus?.campusId) {
        query = query.or(`campus_id.eq.${campus.campusId},campus_id.is.null`);
      }
      const { data, error: qErr } = await query;
      if (qErr) {
        setError(qErr.message);
      } else {
        const rows = (data ?? []) as Guide[];
        setItems(rows);
        await setCached(key, rows);
      }
    } catch (e) {
      setError(
        e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : "Could not load guides.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <StudyShell
      title="Campus guides"
      subtitle="Tips for settling in"
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
      banner={<SyncBanner error={error} />}
    >
      <View
        style={{
          backgroundColor: colors.heroBg,
          borderRadius: radii.xl,
          padding: 20,
          gap: 6,
        }}
      >
        <AppText size={13} style={{ color: colors.heroMuted }}>
          Offline friendly
        </AppText>
        <AppText size={18} weight="700" style={{ color: colors.heroFg }}>
          Guides stay cached on this device
        </AppText>
      </View>

      {loading && items.length === 0 ? null : items.length === 0 ? (
        <EmptyState
          title="No guides yet"
          description="Campus tips and guides will appear here."
        />
      ) : (
        <View style={{ gap: 10 }}>
          {items.map((item) => {
            const open = openId === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setOpenId(open ? null : item.id)}
                style={({ pressed }) => ({
                  backgroundColor: colors.surface,
                  borderRadius: radii.lg,
                  padding: 16,
                  gap: 8,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText size={15} weight="700">
                      {item.title}
                    </AppText>
                    {item.summary ? (
                      <AppText size={13} muted numberOfLines={open ? undefined : 2}>
                        {item.summary}
                      </AppText>
                    ) : null}
                  </View>
                  <Ionicons
                    name={open ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={colors.muted}
                  />
                </View>
                {open && item.body ? (
                  <AppText size={14} style={{ lineHeight: 21 }}>
                    {item.body}
                  </AppText>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </StudyShell>
  );
}
