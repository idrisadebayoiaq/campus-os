import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { AppText, Button, Card, EmptyState, Screen } from "@/src/components/ui";
import { formatNaira, unitTotal } from "@/src/lib/campus";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";

type DetailUnit = {
  id: string;
  title: string;
  unit_type: string;
  rent_base: number | null;
  fee_agent: number | null;
  fee_agreement: number | null;
  fee_caution: number | null;
  fee_service: number | null;
  rent_period: string | null;
  amenities: string[] | null;
  properties:
    | {
        title: string;
        description: string | null;
        verification_label: string | null;
        campus_areas:
          | { name?: string | null }
          | { name?: string | null }[]
          | null;
      }
    | {
        title: string;
        description: string | null;
        verification_label: string | null;
        campus_areas:
          | { name?: string | null }
          | { name?: string | null }[]
          | null;
      }[]
    | null;
};

function areaName(property: DetailUnit["properties"]) {
  const p = Array.isArray(property) ? property[0] : property;
  const areas = p?.campus_areas;
  if (Array.isArray(areas)) return areas[0]?.name || "Nearby";
  return areas?.name || "Nearby";
}

export default function HousingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useTheme();
  const [unit, setUnit] = useState<DetailUnit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!id) return;
      const { data, error: queryError } = await supabase
        .from("property_units")
        .select(
          "id, title, unit_type, rent_base, fee_agent, fee_agreement, fee_caution, fee_service, rent_period, amenities, properties(title, description, verification_label, campus_areas(name))",
        )
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (queryError) setError(queryError.message);
      setUnit((data as DetailUnit) || null);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.fg} />
        </View>
      </Screen>
    );
  }

  if (!unit) {
    return (
      <Screen>
        <EmptyState
          title="Listing not found"
          description={error || "This unit may be unpublished."}
        />
      </Screen>
    );
  }

  const property = Array.isArray(unit.properties)
    ? unit.properties[0]
    : unit.properties;
  const total = unitTotal(unit);

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <View
          style={[
            styles.media,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        />
        <AppText size={24} weight="700">
          {unit.title}
        </AppText>
        <AppText muted>
          {property?.title} · {areaName(unit.properties)} ·{" "}
          {(unit.unit_type || "").replaceAll("_", " ")}
        </AppText>

        <Card style={{ gap: 10 }}>
          <FeeRow
            label="Base rent"
            value={`${formatNaira(unit.rent_base)} / ${unit.rent_period || "term"}`}
          />
          <FeeRow label="Agent" value={formatNaira(unit.fee_agent)} />
          <FeeRow label="Agreement" value={formatNaira(unit.fee_agreement)} />
          <FeeRow label="Caution" value={formatNaira(unit.fee_caution)} />
          <FeeRow label="Service" value={formatNaira(unit.fee_service)} />
          <FeeRow label="Total move-in" value={formatNaira(total)} bold />
        </Card>

        <Card style={{ gap: 8 }}>
          <AppText weight="600">Amenities</AppText>
          <AppText muted size={14}>
            {(unit.amenities || []).join(", ") || "No amenities listed"}
          </AppText>
          <AppText muted size={14}>
            {property?.description || "No description."}
          </AppText>
          <AppText muted size={12}>
            Verification:{" "}
            {(property?.verification_label || "unverified").replaceAll("_", " ")}
          </AppText>
        </Card>

        <AppText muted size={13}>
          Inspect in person before paying. Enquire and inspection request land in
          the next mobile build — use the website for those actions today.
        </AppText>

        <Button
          title="Share listing"
          variant="secondary"
          onPress={() => {
            void Share.share({
              message: `CampusOS housing: ${unit.title} — total move-in ${formatNaira(total)}`,
            });
          }}
        />
      </ScrollView>
    </Screen>
  );
}

function FeeRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <View style={styles.feeRow}>
      <AppText muted size={13}>
        {label}
      </AppText>
      <AppText weight={bold ? "600" : "400"} size={14}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  media: {
    height: 180,
    borderRadius: 12,
    borderWidth: 1,
  },
  feeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
});
