import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { AppText, Card, EmptyState, Screen } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import {
  formatNaira,
  getStudentCampus,
  unitTotal,
  type StudentCampus,
} from "@/src/lib/campus";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";

type HousingUnit = {
  id: string;
  title: string;
  unit_type: string;
  rent_base: number | null;
  fee_agent: number | null;
  fee_agreement: number | null;
  fee_caution: number | null;
  fee_service: number | null;
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

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    const campusRow = await getStudentCampus(supabase, user.id);
    setCampus(campusRow);
    if (!campusRow) {
      setUnits([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data, error: queryError } = await supabase
      .from("property_units")
      .select(
        "id, title, unit_type, rent_base, fee_agent, fee_agreement, fee_caution, fee_service, properties!inner(title, campus_id, verification_label, is_published, campus_areas(name))",
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
    } else {
      const filtered = ((data as HousingUnit[]) || []).filter((unit) => {
        const property = Array.isArray(unit.properties)
          ? unit.properties[0]
          : unit.properties;
        return property?.verification_label !== "unverified";
      });
      setUnits(filtered);
    }
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 4 }}>
        <AppText muted size={13}>
          {campus
            ? `${campus.institutionName} · ${campus.campusName}`
            : "Campus not selected"}
        </AppText>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.fg} />
        </View>
      ) : !campus ? (
        <View style={{ padding: 16 }}>
          <EmptyState
            title="Choose your campus first"
            description="Finish school selection on the CampusOS website, then refresh here."
          />
        </View>
      ) : (
        <FlatList
          data={units}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
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
                error || "Widen filters on the website or check back soon."
              }
            />
          }
          renderItem={({ item }) => {
            const property = Array.isArray(item.properties)
              ? item.properties[0]
              : item.properties;
            const total = unitTotal(item);
            return (
              <Pressable
                onPress={() => router.push(`/housing/${item.id}`)}
                style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
              >
                <Card style={{ gap: 6 }}>
                  <View
                    style={[
                      styles.media,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  />
                  <AppText weight="600">{item.title}</AppText>
                  <AppText muted size={13}>
                    {areaName(item.properties)} ·{" "}
                    {(item.unit_type || "").replaceAll("_", " ")}
                  </AppText>
                  {property?.title ? (
                    <AppText muted size={12}>
                      {property.title}
                    </AppText>
                  ) : null}
                  <AppText weight="600" size={15}>
                    {formatNaira(total)} move-in
                  </AppText>
                </Card>
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  media: {
    height: 120,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 4,
  },
});
