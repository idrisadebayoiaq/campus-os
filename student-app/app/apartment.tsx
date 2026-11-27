import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, Button, EmptyState } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import { startBusinessChat } from "@/src/lib/messaging";
import { supabase } from "@/src/lib/supabase";
import { daysUntil, useTenancy } from "@/src/lib/tenancy";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type Home = {
  id: string;
  rent_amount: number;
  rent_period: string;
  start_date: string;
  end_date: string | null;
  next_due_on: string | null;
  business_id: string;
  unit: {
    title: string;
    unit_type: string;
    furnished: boolean | null;
    amenities: string[] | null;
    property_id: string;
    property: { title: string; address_public: string | null } | null;
  } | null;
  agent: string | null;
  photo: string | null;
  photos: string[];
};

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "–";

const TYPE_LABEL: Record<string, string> = {
  room: "Room",
  self_contained: "Self-contain",
  shared_apartment: "Shared apartment",
  hostel_bed: "Hostel bed",
};

function dueText(days: number | null) {
  if (days === null) return "No due date set";
  if (days < 0) return `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

export default function ApartmentScreen() {
  const { user } = useAuth();
  const { tenancy, loading: tenancyLoading, refresh } = useTenancy();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [home, setHome] = useState<Home | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenancy) {
      setHome(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const { data } = await supabase
      .from("tenancies")
      .select(
        "id, rent_amount, rent_period, start_date, end_date, next_due_on, business_id, property_units(title, unit_type, furnished, amenities, property_id, properties(title, address_public)), business_profiles(display_name)",
      )
      .eq("id", tenancy.id)
      .maybeSingle();
    if (!data) {
      setHome(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const row = data as unknown as {
      id: string;
      rent_amount: number;
      rent_period: string;
      start_date: string;
      end_date: string | null;
      next_due_on: string | null;
      business_id: string;
      property_units: unknown;
      business_profiles: unknown;
    };
    const rawUnit = one(row.property_units as never) as
      | (Omit<NonNullable<Home["unit"]>, "property"> & { properties: unknown })
      | null;
    const unit: Home["unit"] = rawUnit
      ? {
          title: rawUnit.title,
          unit_type: rawUnit.unit_type,
          furnished: rawUnit.furnished,
          amenities: rawUnit.amenities,
          property_id: rawUnit.property_id,
          property: one(rawUnit.properties as never) as { title: string; address_public: string | null } | null,
        }
      : null;

    let photos: string[] = [];
    if (unit) {
      const { data: media } = await supabase
        .from("listing_media")
        .select("url, kind, is_cover, sort_order, unit_id, property_id")
        .or(`unit_id.eq.${tenancy.unit_id},property_id.eq.${unit.property_id}`)
        .order("is_cover", { ascending: false })
        .order("sort_order", { ascending: true })
        .limit(12);
      photos = ((media ?? []) as { url: string | null; kind: string | null }[])
        .filter((m) => m.url && (m.kind ?? "image") === "image")
        .map((m) => m.url as string);
    }

    setHome({
      id: row.id,
      rent_amount: Number(row.rent_amount),
      rent_period: row.rent_period,
      start_date: row.start_date,
      end_date: row.end_date,
      next_due_on: row.next_due_on,
      business_id: row.business_id,
      unit,
      agent: (one(row.business_profiles as never) as { display_name: string } | null)?.display_name ?? null,
      photo: photos[0] ?? null,
      photos,
    });
    setLoading(false);
    setRefreshing(false);
  }, [tenancy]);

  useEffect(() => {
    if (tenancyLoading) return;
    void load();
  }, [load, tenancyLoading]);

  async function messageAgent() {
    if (!user || !home) return;
    setBusy(true);
    setError(null);
    try {
      const id = await startBusinessChat(supabase, {
        studentId: user.id,
        businessId: home.business_id,
        subject: home.unit?.title ?? "My apartment",
        message: `Hi, I'm your tenant at ${home.unit?.title ?? "your property"}.`,
      });
      router.push(`/inbox/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open chat");
    } finally {
      setBusy(false);
    }
  }

  const days = daysUntil(home?.next_due_on ?? null);
  const urgent = days !== null && days <= 7;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void refresh().then(load);
            }}
          />
        }
      >
        <View style={styles.hero}>
          {home?.photo ? (
            <Image source={{ uri: home.photo }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="home" size={56} color={colors.muted} />
            </View>
          )}
          <View style={[styles.heroShade]} />
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/settings"))}
            style={[styles.back, { top: insets.top + 8 }]}
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
        </View>

        {loading || tenancyLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.fg} />
        ) : !home ? (
          <View style={{ padding: 16, gap: 14 }}>
            <EmptyState
              title="No active house yet"
              description="Once your agent hands over your keys, your house shows up here with its rent dates and receipts."
            />
            <Button title="Find a house" onPress={() => router.navigate("/(tabs)/housing")} />
          </View>
        ) : (
          <View style={{ padding: 16, gap: 14 }}>
            <View style={{ gap: 4 }}>
              <AppText size={11} weight="700" muted>
                YOUR CURRENT HOME
              </AppText>
              <AppText size={24} weight="700">
                {home.unit?.title ?? "Your room"}
              </AppText>
              <AppText muted>
                {home.unit?.property?.title ?? "Property"}
                {home.unit?.property?.address_public ? ` · ${home.unit.property.address_public}` : ""}
              </AppText>
            </View>

            {home.photos.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {home.photos.slice(1).map((p) => (
                  <Image key={p} source={{ uri: p }} style={styles.thumb} />
                ))}
              </ScrollView>
            ) : null}

            <View style={[styles.card, { backgroundColor: urgent ? colors.danger + "22" : colors.surface }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name="calendar-outline" size={22} color={urgent ? colors.danger : colors.accent} />
                <View style={{ flex: 1 }}>
                  <AppText weight="700" style={urgent ? { color: colors.danger } : undefined}>
                    {dueText(days)}
                  </AppText>
                  <AppText size={12} muted>
                    Next rent: {formatNaira(home.rent_amount)} on {day(home.next_due_on)}
                  </AppText>
                </View>
              </View>
              <AppText size={12} muted>
                We remind you a month, a week, 3 days and 24 hours before rent is due.
              </AppText>
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Row label="Type" value={TYPE_LABEL[home.unit?.unit_type ?? ""] ?? home.unit?.unit_type ?? "–"} />
              <Row label="Furnished" value={home.unit?.furnished ? "Yes" : "No"} />
              <Row label={`Rent / ${home.rent_period}`} value={formatNaira(home.rent_amount)} />
              <Row label="Moved in" value={day(home.start_date)} />
              {home.end_date ? <Row label="Tenancy ends" value={day(home.end_date)} /> : null}
              <Row label="Agent" value={home.agent ?? "–"} />
              {home.unit?.amenities?.length ? <Row label="Amenities" value={home.unit.amenities.join(", ")} /> : null}
            </View>

            {error ? (
              <AppText size={13} style={{ color: colors.danger }}>
                {error}
              </AppText>
            ) : null}

            <Button title="Rent receipts & move-in checklist" variant="secondary" onPress={() => router.push("/my-room")} />
            <Button title="Message my agent" variant="secondary" loading={busy} onPress={() => void messageAgent()} />
            <Button title="Find new house" onPress={() => router.navigate("/(tabs)/housing")} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <AppText size={13} muted>
        {label}
      </AppText>
      <AppText size={14} weight="600" style={{ flex: 1, textAlign: "right" }}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { height: 260, width: "100%" },
  heroShade: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.18)" },
  back: {
    position: "absolute",
    left: 14,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumb: { width: 110, height: 80, borderRadius: radii.md },
  card: { borderRadius: radii.lg, padding: 16, gap: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 16, paddingVertical: 2 },
});
