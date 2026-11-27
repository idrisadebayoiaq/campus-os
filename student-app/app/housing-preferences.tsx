import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, TextInput, View } from "react-native";
import { ChipRow, Group, ListRow, PageShell, Section } from "@/src/components/page";
import { AppText, Button } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { notify, toast } from "@/src/lib/feedback";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

const STATUSES = [
  { value: "need_room", label: "Need a room" },
  { value: "moving_soon", label: "Moving soon" },
  { value: "housed", label: "Housed" },
  { value: "exploring", label: "Exploring" },
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
  { value: "water", label: "Water" },
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
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [budget, setBudget] = useState("");
  const [period, setPeriod] = useState("year");
  const [types, setTypes] = useState<string[]>([]);
  const [facilities, setFacilities] = useState<string[]>([]);
  const [alerts, setAlerts] = useState(false);
  const [saving, setSaving] = useState(false);

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

  async function save() {
    if (!user) return;
    setSaving(true);
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
    if (error) notify("Couldn't save", error.message, undefined, { tone: "danger" });
    else toast.success("Preferences saved");
  }

  const formatted = budget ? Number(budget).toLocaleString() : "";

  return (
    <PageShell
      title="Housing preferences"
      loading={loading}
      footer={<Button title="Save" onPress={() => void save()} loading={saving} />}
    >
      <Section title="Status">
        <ChipRow options={STATUSES} value={status} onChange={(v) => setStatus(status === v ? "" : v)} />
      </Section>

      <Section title="Max budget">
        <View style={[styles.money, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
          <AppText size={18} weight="700" muted>
            ₦
          </AppText>
          <TextInput
            value={formatted}
            onChangeText={(t) => setBudget(t.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
            placeholder="250,000"
            placeholderTextColor={colors.muted}
            style={[styles.moneyInput, { color: colors.fg }]}
          />
        </View>
        <ChipRow options={PERIODS} value={period} onChange={setPeriod} />
      </Section>

      <Section title="Room type">
        <MultiChips options={TYPES} selected={types} onChange={setTypes} />
      </Section>

      <Section title="Must have">
        <MultiChips options={FACILITIES} selected={facilities} onChange={setFacilities} />
      </Section>

      <Group>
        <ListRow
          icon="notifications-outline"
          title="Alert me on new matches"
          chevron={false}
          right={<Switch value={alerts} onValueChange={setAlerts} trackColor={{ true: colors.accent, false: colors.border }} />}
        />
      </Group>
    </PageShell>
  );
}

function MultiChips({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const colors = useTheme();
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(on ? selected.filter((v) => v !== o.value) : [...selected, o.value])}
            style={[styles.chip, { backgroundColor: on ? colors.inverseBg : colors.surface }]}
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
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radii.pill },
  money: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, minHeight: 56 },
  moneyInput: { flex: 1, fontSize: 22, fontWeight: "700", paddingVertical: 10 },
});
