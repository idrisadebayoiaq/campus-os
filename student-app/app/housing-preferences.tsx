import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, Button } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

const STATUSES = [
  { value: "need_room", label: "Need a room" },
  { value: "moving_soon", label: "Moving soon" },
  { value: "housed", label: "Already housed" },
  { value: "exploring", label: "Just exploring" },
];

const PERIODS = [
  { value: "year", label: "Per year" },
  { value: "semester", label: "Per semester" },
  { value: "month", label: "Per month" },
];

const TYPES = [
  { value: "single_room", label: "Single room" },
  { value: "self_contain", label: "Self contain" },
  { value: "room_and_parlour", label: "Room & parlour" },
  { value: "shared_room", label: "Shared room" },
  { value: "flat", label: "Flat" },
  { value: "hostel", label: "Hostel" },
];

const FACILITIES = [
  { value: "water", label: "Running water" },
  { value: "electricity", label: "Steady light" },
  { value: "prepaid_meter", label: "Prepaid meter" },
  { value: "security", label: "Security" },
  { value: "wifi", label: "Wi-Fi" },
  { value: "kitchen", label: "Kitchen" },
  { value: "furnished", label: "Furnished" },
  { value: "parking", label: "Parking" },
];

export default function HousingPreferencesScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [budget, setBudget] = useState("");
  const [period, setPeriod] = useState("year");
  const [types, setTypes] = useState<string[]>([]);
  const [facilities, setFacilities] = useState<string[]>([]);
  const [alerts, setAlerts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("housing_preferences")
        .select("housing_status, max_budget, budget_period, accommodation_types, facilities, alerts_enabled")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setStatus(data.housing_status ?? "");
        setBudget(data.max_budget ? String(Math.round(Number(data.max_budget))) : "");
        setPeriod(data.budget_period ?? "year");
        setTypes((data.accommodation_types as string[] | null) ?? []);
        setFacilities((data.facilities as string[] | null) ?? []);
        setAlerts(Boolean(data.alerts_enabled));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  function toggle(list: string[], value: string, set: (v: string[]) => void) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function save() {
    if (!user) return;
    setSaving(true);
    setResult(null);
    const amount = Number(budget.replace(/[^0-9]/g, ""));
    const { error } = await supabase.from("housing_preferences").upsert(
      {
        user_id: user.id,
        housing_status: status || null,
        max_budget: amount > 0 ? amount : null,
        budget_period: period,
        accommodation_types: types,
        facilities,
        alerts_enabled: alerts,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    setResult(error ? { ok: false, text: error.message } : { ok: true, text: "Housing preferences saved" });
  }

  const formattedBudget = budget ? Number(budget.replace(/[^0-9]/g, "")).toLocaleString() : "";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.top}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.back, { backgroundColor: colors.surface }]}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={20} color={colors.fg} />
        </Pressable>
        <AppText size={18} weight="700">
          Housing preferences
        </AppText>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.fg} />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        >
          <ScrollView
            contentContainerStyle={{ padding: 20, gap: 22, paddingBottom: 140 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <AppText muted size={13}>
              We use these to rank rooms in Housing and to send alerts when a match is listed.
            </AppText>

            <Group title="Where you are">
              <ChipSet
                options={STATUSES}
                selected={status ? [status] : []}
                onPress={(v) => setStatus(status === v ? "" : v)}
              />
            </Group>

            <Group title="Budget">
              <View style={[styles.money, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                <AppText size={17} weight="700" muted>
                  ₦
                </AppText>
                <TextInput
                  value={formattedBudget}
                  onChangeText={(t) => setBudget(t.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad"
                  placeholder="250,000"
                  placeholderTextColor={colors.muted}
                  style={[styles.moneyInput, { color: colors.fg }]}
                />
              </View>
              <ChipSet
                options={PERIODS}
                selected={[period]}
                onPress={setPeriod}
              />
            </Group>

            <Group title="Room type">
              <ChipSet
                options={TYPES}
                selected={types}
                onPress={(v) => toggle(types, v, setTypes)}
              />
            </Group>

            <Group title="Must have">
              <ChipSet
                options={FACILITIES}
                selected={facilities}
                onPress={(v) => toggle(facilities, v, setFacilities)}
              />
            </Group>

            <Group title="Alerts">
              <View style={styles.switchRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText size={14} weight="600">
                    New room alerts
                  </AppText>
                  <AppText muted size={12}>
                    Get notified when a room that matches is listed.
                  </AppText>
                </View>
                <Switch
                  value={alerts}
                  onValueChange={setAlerts}
                  trackColor={{ true: colors.accent, false: colors.border }}
                />
              </View>
            </Group>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.bg,
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 12) + 4,
          },
        ]}
      >
        {result ? (
          <AppText
            size={13}
            style={{ color: result.ok ? colors.success : colors.danger, textAlign: "center", marginBottom: 8 }}
          >
            {result.text}
          </AppText>
        ) : null}
        <Button title="Save preferences" onPress={save} loading={saving} disabled={loading} />
      </View>
    </View>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <AppText muted size={12} weight="600" style={{ marginLeft: 4 }}>
        {title.toUpperCase()}
      </AppText>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>{children}</View>
    </View>
  );
}

function ChipSet({
  options,
  selected,
  onPress,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onPress: (value: string) => void;
}) {
  const colors = useTheme();
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <Pressable
            key={o.value}
            onPress={() => onPress(o.value)}
            style={[
              styles.chip,
              {
                backgroundColor: on ? colors.inverseBg : colors.bg,
                borderColor: on ? colors.inverseBg : colors.border,
              },
            ]}
          >
            <AppText size={13} weight="600" style={{ color: on ? colors.inverseFg : colors.fg }}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: radii.md, padding: 16, gap: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  money: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  moneyInput: { flex: 1, fontSize: 20, fontWeight: "700", paddingVertical: 10 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
