import { Ionicons } from "@expo/vector-icons";
import { Redirect, router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  AppText,
  Button,
  Chip,
  EmptyState,
  Field,
  Input,
  Screen,
  SearchBar,
} from "@/src/components/ui";
import { LocationPicker } from "@/src/components/location-picker";
import { useAuth } from "@/src/lib/auth";
import {
  distanceKm,
  formatDistance,
  loadSavedLocation,
  saveLocation,
  type SavedLocation,
} from "@/src/lib/location";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type Campus = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
};

type Institution = {
  id: string;
  name: string;
  short_name: string | null;
  institution_type: string;
  campuses: Campus[] | Campus | null;
};

const TERTIARY_TYPES = [
  "university",
  "polytechnic",
  "college_of_education",
  "college",
  "monotechnic",
  "other",
];

const MAX_VISIBLE = 40;

function campusesOf(inst: Institution | null | undefined): Campus[] {
  if (!inst?.campuses) return [];
  return Array.isArray(inst.campuses) ? inst.campuses : [inst.campuses];
}

export default function OnboardingScreen() {
  const { user, loading: authLoading } = useAuth();
  const colors = useTheme();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [institutionId, setInstitutionId] = useState("");
  const [campusId, setCampusId] = useState("");
  const [academicLevel, setAcademicLevel] = useState("");
  const [department, setDepartment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [home, setHome] = useState<SavedLocation | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error: queryError } = await supabase
        .from("institutions")
        .select(
          "id, name, short_name, institution_type, campuses(id, name, city, state, lat, lng)",
        )
        .eq("is_active", true)
        .in("institution_type", TERTIARY_TYPES)
        .order("name");
      if (cancelled) return;
      if (queryError) setError(queryError.message);
      setInstitutions((data as Institution[]) || []);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Prefill from existing profile data when revisiting from Profile.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function prefill() {
      const { data } = await supabase
        .from("student_profiles")
        .select("academic_level, department_name")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (cancelled || !data) return;
      setAcademicLevel((v) => v || String(data.academic_level || ""));
      setDepartment((v) => v || String(data.department_name || ""));
    }
    void prefill();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // The student's chosen location (from signup), used to rank schools by distance.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      let loc = await loadSavedLocation(supabase, user.id);
      const meta = user.user_metadata as Record<string, unknown> | undefined;
      if (!loc && meta?.location_lat != null && meta?.location_lng != null) {
        loc = {
          label: String(meta.location_label ?? ""),
          lat: Number(meta.location_lat),
          lng: Number(meta.location_lng),
        };
        await saveLocation(supabase, user.id, loc);
      }
      if (!cancelled) setHome(loc);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const distanceOf = useMemo(() => {
    const map = new Map<string, number>();
    if (!home) return map;
    for (const inst of institutions) {
      let best = Infinity;
      for (const c of campusesOf(inst)) {
        if (c.lat == null || c.lng == null) continue;
        best = Math.min(best, distanceKm(home, { lat: c.lat, lng: c.lng }));
      }
      if (best < Infinity) map.set(inst.id, best);
    }
    return map;
  }, [institutions, home]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    const list = institutions
      .filter((i) => TERTIARY_TYPES.includes(i.institution_type))
      .filter((i) => {
        if (!tokens.length) return true;
        const campusText = campusesOf(i)
          .map((c) => `${c.city || ""} ${c.state || ""}`)
          .join(" ");
        const hay = `${i.name} ${i.short_name || ""} ${campusText}`.toLowerCase();
        return hay.includes(q) || tokens.every((t) => hay.includes(t));
      });
    if (!home) return list;
    return [...list].sort(
      (a, b) => (distanceOf.get(a.id) ?? Infinity) - (distanceOf.get(b.id) ?? Infinity),
    );
  }, [institutions, query, home, distanceOf]);

  const selected = institutions.find((i) => i.id === institutionId) || null;
  const campuses = campusesOf(selected);

  function pickInstitution(inst: Institution) {
    setInstitutionId(inst.id);
    setCampusId(campusesOf(inst)[0]?.id || "");
    setError(null);
  }

  async function onSave() {
    if (!user) {
      setError("Please log in first.");
      return;
    }
    if (!selected || !campusId) {
      setError("Select your institution and campus.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const level = academicLevel.trim() || null;
      const dept = department.trim() || null;

      await supabase
        .from("campus_memberships")
        .update({ is_primary: false })
        .eq("user_id", user.id);

      const { error: membershipError } = await supabase
        .from("campus_memberships")
        .upsert(
          {
            user_id: user.id,
            institution_id: selected.id,
            campus_id: campusId,
            department: dept,
            year_of_study: level,
            is_primary: true,
          },
          { onConflict: "user_id,campus_id" },
        );
      if (membershipError) throw new Error(membershipError.message);

      // Best effort: mirror the web enrollment row.
      await supabase.from("student_enrollments").upsert(
        {
          user_id: user.id,
          institution_id: selected.id,
          campus_id: campusId,
          is_primary: true,
          verification_status: "unverified",
        },
        { onConflict: "user_id,institution_id,campus_id" },
      );

      const { error: studentError } = await supabase
        .from("student_profiles")
        .upsert({
          user_id: user.id,
          academic_level: level,
          department_name: dept,
          updated_at: new Date().toISOString(),
        });
      if (studentError) throw new Error(studentError.message);

      // Managed schools only: auto-enroll + pull lecturer timetables
      await supabase.rpc("auto_enroll_student_for_school", {
        p_institution_id: selected.id,
        p_campus_id: campusId,
        p_department_id: null,
        p_department_name: dept,
      });

      const { data: existing } = await supabase
        .from("onboarding_progress")
        .select("completed_steps")
        .eq("user_id", user.id)
        .maybeSingle();
      const completed = Array.from(
        new Set([
          ...((existing?.completed_steps as string[] | null) || []),
          "school",
          "academic",
        ]),
      );
      await supabase.from("onboarding_progress").upsert({
        user_id: user.id,
        current_step: "done",
        completed_steps: completed,
        is_complete: true,
        updated_at: new Date().toISOString(),
      });

      router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your campus.");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.fg} />
        </View>
      </Screen>
    );
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  const visible = filtered.slice(0, MAX_VISIBLE);

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ gap: 6 }}>
            <AppText size={30} weight="700">
              Pick your school
            </AppText>
            <AppText muted size={15}>
              Housing, study tools and listings are scoped to the school you
              attend.
            </AppText>
          </View>

          <Pressable
            onPress={() => setPicking(true)}
            style={[styles.nearRow, { backgroundColor: colors.surface }]}
          >
            <Ionicons name="location" size={18} color={colors.fg} />
            <View style={{ flex: 1 }}>
              <AppText size={12} muted>
                {home ? "Showing schools near" : "Set your location to see nearby schools"}
              </AppText>
              <AppText size={14} weight="600" numberOfLines={1}>
                {home?.label || "Choose on map"}
              </AppText>
            </View>
            <AppText size={13} weight="700" style={{ color: colors.fg, opacity: 0.8 }}>
              {home ? "Change" : "Set"}
            </AppText>
          </Pressable>

          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Search school, short name or city…"
          />

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.fg} />
            </View>
          ) : visible.length === 0 ? (
            <EmptyState
              title="No schools match"
              description="Try a shorter name or the school abbreviation."
            />
          ) : (
            <View style={{ gap: 8 }}>
              {visible.map((inst) => {
                const active = inst.id === institutionId;
                return (
                  <Pressable
                    key={inst.id}
                    onPress={() => pickInstitution(inst)}
                    style={[
                      styles.instRow,
                      {
                        backgroundColor: active
                          ? colors.inverseBg
                          : colors.surface,
                      },
                    ]}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText
                        weight="700"
                        size={15}
                        style={{
                          color: active ? colors.inverseFg : colors.fg,
                        }}
                      >
                        {inst.name}
                      </AppText>
                      <AppText
                        size={12}
                        style={{
                          color: active ? colors.inverseFg : colors.muted,
                          opacity: active ? 0.75 : 1,
                        }}
                      >
                        {[
                          inst.short_name,
                          inst.institution_type.replaceAll("_", " "),
                          campusesOf(inst)[0]?.city,
                          distanceOf.has(inst.id)
                            ? `${formatDistance(distanceOf.get(inst.id)!)} away`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </AppText>
                    </View>
                  </Pressable>
                );
              })}
              {filtered.length > MAX_VISIBLE ? (
                <AppText muted size={13} style={{ textAlign: "center" }}>
                  Showing {MAX_VISIBLE} of {filtered.length}. Refine your
                  search to see more.
                </AppText>
              ) : null}
            </View>
          )}

          {selected ? (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <AppText weight="700">Campus</AppText>
              {campuses.length === 0 ? (
                <AppText muted size={14}>
                  No campuses listed for this school yet.
                </AppText>
              ) : (
                <View style={styles.chips}>
                  {campuses.map((c) => (
                    <Chip
                      key={c.id}
                      label={[c.name, c.city].filter(Boolean).join(" · ")}
                      active={c.id === campusId}
                      onPress={() => setCampusId(c.id)}
                    />
                  ))}
                </View>
              )}
            </View>
          ) : null}

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <AppText weight="700">Academic details (optional)</AppText>
            <Field label="Level">
              <Input
                placeholder="e.g. 200"
                value={academicLevel}
                onChangeText={setAcademicLevel}
                style={{ backgroundColor: colors.bg }}
              />
            </Field>
            <Field label="Department">
              <Input
                placeholder="e.g. Computer Science"
                value={department}
                onChangeText={setDepartment}
                style={{ backgroundColor: colors.bg }}
              />
            </Field>
          </View>

          {error ? (
            <AppText size={14} style={{ color: colors.danger }}>
              {error}
            </AppText>
          ) : null}

          <Button
            title={saving ? "Saving…" : "Continue"}
            onPress={onSave}
            loading={saving}
            disabled={!selected || !campusId}
          />
          {router.canGoBack() ? (
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => router.back()}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      <LocationPicker
        visible={picking}
        title="Your location"
        initial={home}
        onClose={() => setPicking(false)}
        onConfirm={async (place) => {
          setPicking(false);
          setHome(place);
          if (user) await saveLocation(supabase, user.id, place);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
    gap: 18,
  },
  center: { alignItems: "center", justifyContent: "center", padding: 24 },
  instRow: {
    borderRadius: radii.lg,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  card: {
    borderRadius: radii.xl,
    padding: 20,
    gap: 14,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  nearRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
