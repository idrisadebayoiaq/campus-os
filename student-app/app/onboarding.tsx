import { Redirect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { AppText, Button, Chip, Field, Input, Screen } from "@/src/components/ui";
import { LocationPicker } from "@/src/components/location-picker";
import { DropdownField, PickerSheet, type PickerItem } from "@/src/components/picker-sheet";
import { useAuth } from "@/src/lib/auth";
import {
  currentPosition,
  distanceKm,
  formatDistance,
  loadSavedLocation,
  reverseGeocode,
  saveLocation,
  type SavedLocation,
} from "@/src/lib/location";
import { useStudentKind } from "@/src/lib/student-kind";
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

/** Schools closer than this to the student are listed first as "near me". */
const NEAR_KM = 80;

function campusesOf(inst: Institution | null | undefined): Campus[] {
  if (!inst?.campuses) return [];
  return Array.isArray(inst.campuses) ? inst.campuses : [inst.campuses];
}

function typeLabel(t: string) {
  return t.replaceAll("_", " ");
}

export default function OnboardingScreen() {
  const { user, loading: authLoading } = useAuth();
  const { refresh: refreshKind } = useStudentKind();
  const colors = useTheme();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [institutionId, setInstitutionId] = useState("");
  const [campusId, setCampusId] = useState("");
  const [academicLevel, setAcademicLevel] = useState("");
  const [department, setDepartment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [home, setHome] = useState<SavedLocation | null>(null);
  const [homeChecked, setHomeChecked] = useState(false);
  const [picking, setPicking] = useState(false);
  const [schoolOpen, setSchoolOpen] = useState(false);
  const [campusOpen, setCampusOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locNote, setLocNote] = useState<string | null>(null);
  const autoTried = useRef(false);

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

  // The student's saved location (from signup), used to rank schools by distance.
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
      if (!cancelled) {
        setHome(loc);
        setHomeChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  /** Asks for location permission and uses the device position to find schools around it. */
  async function useCurrentLocation(silent: boolean) {
    setLocating(true);
    setLocNote(null);
    const pos = await currentPosition();
    if (!pos) {
      setLocating(false);
      if (!silent) {
        setLocNote("Location permission is off. Search for your school below or pick a spot on the map.");
      }
      return;
    }
    const place = await reverseGeocode(pos);
    const loc: SavedLocation = { label: place.label, lat: pos.lat, lng: pos.lng };
    setHome(loc);
    setShowAll(false);
    if (user) await saveLocation(supabase, user.id, loc);
    setLocating(false);
  }

  // First visit with no saved place: ask once for the device location.
  useEffect(() => {
    if (!user || !homeChecked || home || autoTried.current) return;
    autoTried.current = true;
    void useCurrentLocation(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, homeChecked, home]);

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

  const sortedAll = useMemo(() => {
    const list = institutions.filter((i) => TERTIARY_TYPES.includes(i.institution_type));
    if (!home) return list;
    return [...list].sort(
      (a, b) => (distanceOf.get(a.id) ?? Infinity) - (distanceOf.get(b.id) ?? Infinity),
    );
  }, [institutions, home, distanceOf]);

  const toItem = (i: Institution): PickerItem => {
    const km = distanceOf.get(i.id);
    return {
      id: i.id,
      label: i.name,
      sub: [
        i.short_name,
        typeLabel(i.institution_type),
        campusesOf(i)[0]?.city,
        km != null ? `${formatDistance(km)} away` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      keywords: campusesOf(i)
        .map((c) => `${c.name} ${c.city ?? ""} ${c.state ?? ""}`)
        .join(" "),
    };
  };

  const allItems = useMemo(() => sortedAll.map(toItem), [sortedAll, distanceOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const nearItems = useMemo(
    () => (home ? sortedAll.filter((i) => (distanceOf.get(i.id) ?? Infinity) <= NEAR_KM).map(toItem) : []),
    [sortedAll, home, distanceOf], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const nearMode = Boolean(home) && nearItems.length > 0 && !showAll;

  const selected = institutions.find((i) => i.id === institutionId) || null;
  const campuses = campusesOf(selected);
  const selectedCampus = campuses.find((c) => c.id === campusId) || null;

  function pickInstitution(id: string) {
    const inst = institutions.find((i) => i.id === id);
    if (!inst) return;
    setInstitutionId(inst.id);
    setCampusId(campusesOf(inst)[0]?.id || "");
    setSchoolOpen(false);
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

      await refreshKind();
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

  const sheetHeader = (
    <View style={{ paddingHorizontal: 16, paddingBottom: 10, gap: 8 }}>
      {home ? (
        <AppText muted size={12} numberOfLines={1}>
          {nearMode ? `Schools within ${NEAR_KM} km of ${home.label || "you"}` : `Closest first to ${home.label || "you"}`}
        </AppText>
      ) : (
        <AppText muted size={12}>
          Turn on location to see schools near you, or search by name.
        </AppText>
      )}
      {home && nearItems.length > 0 ? (
        <View style={styles.chips}>
          <Chip label={`Near me (${nearItems.length})`} active={!showAll} onPress={() => setShowAll(false)} />
          <Chip label={`All schools (${allItems.length})`} active={showAll} onPress={() => setShowAll(true)} />
        </View>
      ) : home ? (
        <AppText muted size={12}>
          No listed schools within {NEAR_KM} km. Showing every school, closest first.
        </AppText>
      ) : null}
    </View>
  );

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
              Housing, study tools and listings are scoped to the school you attend.
            </AppText>
          </View>

          <View style={[styles.nearRow, { backgroundColor: colors.surface }]}>
            <Ionicons name="location" size={18} color={colors.fg} />
            <View style={{ flex: 1 }}>
              <AppText size={12} muted>
                {locating
                  ? "Finding schools near you…"
                  : home
                    ? "Showing schools near"
                    : "Turn on location to see schools near you"}
              </AppText>
              <AppText size={14} weight="600" numberOfLines={1}>
                {home?.label || "No location set"}
              </AppText>
            </View>
            {locating ? (
              <ActivityIndicator color={colors.fg} />
            ) : (
              <Pressable onPress={() => setPicking(true)} hitSlop={8}>
                <AppText size={13} weight="700" style={{ color: colors.fg, opacity: 0.8 }}>
                  {home ? "Change" : "Set"}
                </AppText>
              </Pressable>
            )}
          </View>
          {!home && !locating ? (
            <Button
              title="Use my current location"
              variant="secondary"
              compact
              onPress={() => void useCurrentLocation(false)}
            />
          ) : null}
          {locNote ? (
            <AppText muted size={13}>
              {locNote}
            </AppText>
          ) : null}
          {home ? (
            <AppText muted size={12} style={{ marginTop: -6 }}>
              Not studying in this city? Tap Change, or open the school list and choose All schools.
            </AppText>
          ) : null}

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <DropdownField
              label="School"
              value={selected?.name}
              placeholder={loading ? "Loading schools…" : "Select your school"}
              disabled={loading}
              onPress={() => setSchoolOpen(true)}
            />
            {selected ? (
              <DropdownField
                label="Campus"
                value={selectedCampus ? [selectedCampus.name, selectedCampus.city].filter(Boolean).join(" · ") : null}
                placeholder={campuses.length === 0 ? "No campuses listed yet" : "Select your campus"}
                disabled={campuses.length <= 1}
                onPress={() => setCampusOpen(true)}
              />
            ) : null}
          </View>

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
            <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <PickerSheet
        visible={schoolOpen}
        title="Select your school"
        searchPlaceholder="Search school, short name or city…"
        items={nearMode ? nearItems : allItems}
        searchItems={allItems}
        selectedId={institutionId}
        header={sheetHeader}
        onSelect={(i) => pickInstitution(i.id)}
        onClose={() => setSchoolOpen(false)}
        emptyText="No school matches. Try the abbreviation or the city."
      />
      <PickerSheet
        visible={campusOpen}
        title="Select your campus"
        searchable={false}
        items={campuses.map((c) => ({
          id: c.id,
          label: c.name,
          sub: [c.city, c.state].filter(Boolean).join(", ") || undefined,
        }))}
        selectedId={campusId}
        onSelect={(i) => {
          setCampusId(i.id);
          setCampusOpen(false);
        }}
        onClose={() => setCampusOpen(false)}
      />
      <LocationPicker
        visible={picking}
        title="Your location"
        initial={home}
        onClose={() => setPicking(false)}
        onConfirm={async (place) => {
          setPicking(false);
          setHome(place);
          setShowAll(false);
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
