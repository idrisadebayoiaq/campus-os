import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  AppText,
  Chip,
  EmptyState,
  Screen,
  SearchBar,
  TAB_BAR_CLEARANCE,
} from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import {
  formatNaira,
  getStudentCampus,
  unitTotal,
  type StudentCampus,
} from "@/src/lib/campus";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type HousingUnit = {
  id: string;
  title: string;
  unit_type: string;
  rent_base: number | null;
  fee_agent: number | null;
  fee_agreement: number | null;
  fee_caution: number | null;
  fee_service: number | null;
  rent_period?: string | null;
  coverUrl?: string | null;
  saved?: boolean;
  properties:
    | {
        title: string;
        campus_id: string;
        verification_label: string | null;
        campus_areas:
          | { name?: string | null }
          | { name?: string | null }[]
          | null;
      }
    | {
        title: string;
        campus_id: string;
        verification_label: string | null;
        campus_areas:
          | { name?: string | null }
          | { name?: string | null }[]
          | null;
      }[]
    | null;
};

function areaName(property: HousingUnit["properties"]) {
  const p = Array.isArray(property) ? property[0] : property;
  const areas = p?.campus_areas;
  if (Array.isArray(areas)) return areas[0]?.name || "Nearby";
  return areas?.name || "Nearby";
}

export default function HousingScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const [campus, setCampus] = useState<StudentCampus | null>(null);
  const [units, setUnits] = useState<HousingUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const campusRow = await getStudentCampus(supabase, user.id);
      setCampus(campusRow);
      if (!campusRow) {
        setUnits([]);
        return;
      }

      const { data, error: queryError } = await supabase
        .from("property_units")
        .select(
          "id, title, unit_type, rent_base, fee_agent, fee_agreement, fee_caution, fee_service, rent_period, properties!inner(title, campus_id, verification_label, is_published, campus_areas(name))",
        )
        .eq("is_published", true)
        .eq("status", "available")
        .eq("properties.is_published", true)
        .eq("properties.campus_id", campusRow.campusId)
        .order("created_at", { ascending: false })
        .limit(40);

      if (queryError) {
        setError(queryError.message);
        setUnits([]);
        return;
      }

      const filtered = ((data as HousingUnit[]) || []).filter((unit) => {
        const property = Array.isArray(unit.properties)
          ? unit.properties[0]
          : unit.properties;
        return property?.verification_label !== "unverified";
      });

      const ids = filtered.map((u) => u.id);
      const coverByUnit: Record<string, string> = {};
      const savedSet = new Set<string>();

      if (ids.length) {
        const [{ data: mediaRows }, { data: savedRows }] = await Promise.all([
          supabase
            .from("listing_media")
            .select("unit_id, url, sort_order")
            .in("unit_id", ids)
            .order("sort_order", { ascending: true }),
          supabase
            .from("saved_units")
            .select("unit_id")
            .eq("user_id", user.id)
            .in("unit_id", ids),
        ]);
        for (const row of mediaRows || []) {
          if (row.unit_id && row.url && !coverByUnit[row.unit_id]) {
            coverByUnit[row.unit_id] = row.url;
          }
        }
        for (const row of savedRows || []) {
          if (row.unit_id) savedSet.add(row.unit_id);
        }
      }

      setUnits(
        filtered.map((u) => ({
          ...u,
          coverUrl: coverByUnit[u.id] || null,
          saved: savedSet.has(u.id),
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load housing.");
      setUnits([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  async function toggleSave(unitId: string, currentlySaved: boolean) {
    if (!user) {
      router.push("/(auth)/login");
      return;
    }
    setUnits((prev) =>
      prev.map((u) =>
        u.id === unitId ? { ...u, saved: !currentlySaved } : u,
      ),
    );
    if (currentlySaved) {
      await supabase
        .from("saved_units")
        .delete()
        .eq("user_id", user.id)
        .eq("unit_id", unitId);
    } else {
      await supabase
        .from("saved_units")
        .upsert({ user_id: user.id, unit_id: unitId });
    }
  }

  const types = useMemo(() => {
    const set = new Set(
      units.map((u) => (u.unit_type || "room").replaceAll("_", " ")),
    );
    return ["All", ...Array.from(set).slice(0, 5)];
  }, [units]);

  const visible = useMemo(() => {
    return units.filter((unit) => {
      const type = (unit.unit_type || "room").replaceAll("_", " ");
      const matchesType = filter === "All" || type === filter;
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q ||
        unit.title.toLowerCase().includes(q) ||
        areaName(unit.properties).toLowerCase().includes(q);
      return matchesType && matchesQuery;
    });
  }, [units, filter, query]);

  return (
    <Screen padded={false} tabClearance>
      <View style={styles.top}>
        <AppText size={28} weight="700">
          Housing
        </AppText>
        <AppText muted size={14}>
          {campus
            ? `${campus.institutionName} · ${campus.campusName}`
            : "Campus not selected"}
        </AppText>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search rooms or areas…"
        />
      </View>

      <FlatList
        horizontal
        data={types}
        keyExtractor={(item) => item}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={{ flexGrow: 0, marginBottom: 8 }}
        renderItem={({ item }) => (
          <Chip
            label={item}
            active={filter === item}
            onPress={() => setFilter(item)}
          />
        )}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.fg} />
        </View>
      ) : !campus ? (
        <View style={{ padding: 20 }}>
          <EmptyState
            title="Choose your campus first"
            description="Pick your school in Campus settings, then refresh here."
          />
          <Pressable
            onPress={() => router.push("/onboarding")}
            style={[styles.cta, { backgroundColor: colors.accent }]}
          >
            <AppText weight="700" style={{ color: colors.onAccent }}>
              Set campus
            </AppText>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: TAB_BAR_CLEARANCE,
            gap: 12,
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor={colors.fg}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="No rooms for this campus yet"
              description={
                error || "Widen filters or check back soon."
              }
            />
          }
          renderItem={({ item }) => {
            const property = Array.isArray(item.properties)
              ? item.properties[0]
              : item.properties;
            const total = unitTotal(item);
            const period = item.rent_period || "term";
            return (
              <Pressable
                onPress={() => router.push(`/housing/${item.id}`)}
                style={({ pressed }) => [
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    opacity: pressed ? 0.94 : 1,
                  },
                ]}
              >
                <View style={styles.thumbWrap}>
                  {item.coverUrl ? (
                    <Image
                      source={{ uri: item.coverUrl }}
                      style={styles.thumb}
                    />
                  ) : (
                    <View
                      style={[
                        styles.thumb,
                        {
                          backgroundColor: colors.heroBg,
                          alignItems: "center",
                          justifyContent: "center",
                        },
                      ]}
                    >
                      <Ionicons
                        name="home-outline"
                        size={28}
                        color={colors.heroMuted}
                      />
                    </View>
                  )}
                  <View style={styles.badge}>
                    <Ionicons name="star" size={11} color="#F5B301" />
                    <AppText size={11} weight="700">
                      {(property?.verification_label || "listed")
                        .replaceAll("_", " ")
                        .slice(0, 10)}
                    </AppText>
                  </View>
                </View>

                <View style={styles.info}>
                  <AppText weight="700" size={15} numberOfLines={1}>
                    {item.title}
                  </AppText>
                  <View style={styles.locRow}>
                    <Ionicons
                      name="location-outline"
                      size={13}
                      color={colors.muted}
                    />
                    <AppText muted size={12} numberOfLines={1}>
                      {areaName(item.properties)}
                      {property?.title ? ` · ${property.title}` : ""}
                    </AppText>
                  </View>
                  <AppText weight="700" size={14} style={{ marginTop: 4 }}>
                    {formatNaira(total)}
                    <AppText muted size={12}>
                      {" "}
                      /{period}
                    </AppText>
                  </AppText>
                </View>

                <Pressable
                  onPress={(e) => {
                    e.stopPropagation?.();
                    void toggleSave(item.id, Boolean(item.saved));
                  }}
                  hitSlop={10}
                  style={styles.heartBtn}
                >
                  <Ionicons
                    name={item.saved ? "heart" : "heart-outline"}
                    size={22}
                    color={item.saved ? colors.danger : colors.muted}
                  />
                </Pressable>
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 20, paddingTop: 8, gap: 12, marginBottom: 8 },
  chips: { paddingHorizontal: 20, gap: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  cta: {
    marginTop: 16,
    height: 48,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    borderRadius: radii.lg,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 108,
  },
  thumbWrap: {
    width: 88,
    height: 88,
    borderRadius: 18,
    overflow: "hidden",
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  badge: {
    position: "absolute",
    top: 6,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  info: {
    flex: 1,
    gap: 3,
    paddingRight: 4,
  },
  locRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  heartBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
