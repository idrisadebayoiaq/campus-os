import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ChipRow, Group, ListRow, PageShell, Section } from "@/src/components/page";
import { PickerSheet, type PickerItem } from "@/src/components/picker-sheet";
import { AppText, Button, Input } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { notify, toast } from "@/src/lib/feedback";
import { distanceKm, formatDistance, loadSavedLocation, type SavedLocation } from "@/src/lib/location";
import { useStudentKind } from "@/src/lib/student-kind";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type Campus = { id: string; name: string; city: string | null; state: string | null; lat: number | null; lng: number | null };
type Institution = { id: string; name: string; short_name: string | null; institution_type: string; campuses: Campus[] | Campus | null };

const TYPES = ["university", "polytechnic", "college_of_education", "college", "monotechnic", "other"];
const LEVELS = ["100", "200", "300", "400", "500", "600"].map((v) => ({ value: v, label: v }));

const campusesOf = (i: Institution | null | undefined): Campus[] =>
  !i?.campuses ? [] : Array.isArray(i.campuses) ? i.campuses : [i.campuses];

export default function CampusScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const { isExamPrep, refresh: refreshKind } = useStudentKind();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [home, setHome] = useState<SavedLocation | null>(null);
  const [institutionId, setInstitutionId] = useState("");
  const [campusId, setCampusId] = useState("");
  const [initial, setInitial] = useState({ institutionId: "", campusId: "", department: "", level: "" });
  const [department, setDepartment] = useState("");
  const [level, setLevel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState<"school" | "campus" | null>(null);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const [inst, mem, prof, loc] = await Promise.all([
        supabase
          .from("institutions")
          .select("id, name, short_name, institution_type, campuses(id, name, city, state, lat, lng)")
          .eq("is_active", true)
          .in("institution_type", TYPES)
          .order("name"),
        supabase.from("campus_memberships").select("institution_id, campus_id, department, year_of_study").eq("user_id", user.id).eq("is_primary", true).maybeSingle(),
        supabase.from("student_profiles").select("academic_level, department_name").eq("user_id", user.id).maybeSingle(),
        loadSavedLocation(supabase, user.id),
      ]);
      setInstitutions((inst.data as Institution[]) ?? []);
      setHome(loc);
      const start = {
        institutionId: mem.data?.institution_id ?? "",
        campusId: mem.data?.campus_id ?? "",
        department: String(prof.data?.department_name ?? mem.data?.department ?? ""),
        level: String(prof.data?.academic_level ?? mem.data?.year_of_study ?? ""),
      };
      setInitial(start);
      setInstitutionId(start.institutionId);
      setCampusId(start.campusId);
      setDepartment(start.department);
      setLevel(start.level);
      setLoading(false);
    })();
  }, [user]);

  const distance = useMemo(() => {
    const map = new Map<string, number>();
    if (!home) return map;
    for (const i of institutions) {
      let best = Infinity;
      for (const c of campusesOf(i)) if (c.lat != null && c.lng != null) best = Math.min(best, distanceKm(home, { lat: c.lat, lng: c.lng }));
      if (best < Infinity) map.set(i.id, best);
    }
    return map;
  }, [institutions, home]);

  const schoolItems: PickerItem[] = useMemo(
    () =>
      [...institutions]
        .sort((a, b) => (distance.get(a.id) ?? Infinity) - (distance.get(b.id) ?? Infinity))
        .map((i) => {
          const km = distance.get(i.id);
          return {
            id: i.id,
            label: i.name,
            sub: [i.short_name, campusesOf(i)[0]?.city, km != null ? formatDistance(km) : null].filter(Boolean).join(" · "),
            keywords: campusesOf(i).map((c) => `${c.name} ${c.city ?? ""} ${c.state ?? ""}`).join(" "),
          };
        }),
    [institutions, distance],
  );

  const school = institutions.find((i) => i.id === institutionId) ?? null;
  const campuses = campusesOf(school);
  const campus = campuses.find((c) => c.id === campusId) ?? null;
  const dirty =
    institutionId !== initial.institutionId ||
    campusId !== initial.campusId ||
    department.trim() !== initial.department ||
    level !== initial.level;

  async function save() {
    if (!user || !school || !campusId) {
      notify("Pick your school and campus", undefined, undefined, { tone: "danger" });
      return;
    }
    setSaving(true);
    try {
      const dept = department.trim() || null;
      const lvl = level || null;
      await supabase.from("campus_memberships").update({ is_primary: false }).eq("user_id", user.id);
      const { error: mErr } = await supabase
        .from("campus_memberships")
        .upsert(
          { user_id: user.id, institution_id: school.id, campus_id: campusId, department: dept, year_of_study: lvl, is_primary: true },
          { onConflict: "user_id,campus_id" },
        );
      if (mErr) throw new Error(mErr.message);
      await supabase
        .from("student_enrollments")
        .upsert(
          { user_id: user.id, institution_id: school.id, campus_id: campusId, is_primary: true, verification_status: "unverified" },
          { onConflict: "user_id,institution_id,campus_id" },
        );
      const { error: pErr } = await supabase
        .from("student_profiles")
        .upsert({ user_id: user.id, academic_level: lvl, department_name: dept, updated_at: new Date().toISOString() });
      if (pErr) throw new Error(pErr.message);
      await supabase.rpc("auto_enroll_student_for_school", {
        p_institution_id: school.id,
        p_campus_id: campusId,
        p_department_id: null,
        p_department_name: dept,
      });
      await refreshKind();
      setInitial({ institutionId, campusId, department: dept ?? "", level: lvl ?? "" });
      toast.success("Campus saved");
    } catch (e) {
      notify("Couldn't save", e instanceof Error ? e.message : "Try again.", undefined, { tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  if (isExamPrep) {
    return (
      <PageShell title="Campus">
        <Group>
          <ListRow icon="flag-outline" title="Target school" subtitle="Set in Exam goals" onPress={() => router.replace("/exam-goals")} />
        </Group>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Campus"
      loading={loading}
      footer={dirty ? <Button title="Save changes" onPress={() => void save()} loading={saving} /> : undefined}
    >
      <View style={[styles.hero, { backgroundColor: colors.heroBg }]}>
        <View style={[styles.heroIcon, { backgroundColor: colors.accent }]}>
          <Ionicons name="school" size={24} color={colors.onAccent} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText weight="700" size={18} style={{ color: colors.heroFg }} numberOfLines={2}>
            {school?.name ?? "No school yet"}
          </AppText>
          <AppText size={13} style={{ color: colors.heroMuted }} numberOfLines={1}>
            {[campus?.name, campus?.city].filter(Boolean).join(" · ") || "Pick your school below"}
          </AppText>
        </View>
      </View>

      <Section title="School">
        <Group>
          <ListRow icon="business-outline" title="School" value={school?.short_name ?? (school ? "Change" : "Choose")} onPress={() => setSheet("school")} />
          <ListRow
            icon="location-outline"
            title="Campus"
            value={campus?.name ?? "Choose"}
            onPress={() => (school ? setSheet("campus") : setSheet("school"))}
          />
        </Group>
      </Section>

      <Section title="Department">
        <Input value={department} onChangeText={setDepartment} placeholder="e.g. Computer Science" maxLength={80} />
      </Section>

      <Section title="Level">
        <ChipRow options={LEVELS} value={level} onChange={setLevel} />
      </Section>

      <PickerSheet
        visible={sheet === "school"}
        title="Your school"
        items={schoolItems}
        selectedId={institutionId}
        searchPlaceholder="Search schools"
        onSelect={({ id }) => {
          const inst = institutions.find((i) => i.id === id);
          setInstitutionId(id);
          setCampusId(campusesOf(inst)[0]?.id ?? "");
          setSheet(campusesOf(inst).length > 1 ? "campus" : null);
        }}
        onClose={() => setSheet(null)}
      />
      <PickerSheet
        visible={sheet === "campus"}
        title="Campus"
        searchable={campuses.length > 8}
        items={campuses.map((c) => ({ id: c.id, label: c.name, sub: [c.city, c.state].filter(Boolean).join(", ") }))}
        selectedId={campusId}
        onSelect={({ id }) => {
          setCampusId(id);
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
      />
    </PageShell>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center", gap: 14, padding: 18, borderRadius: radii.xl },
  heroIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
});
