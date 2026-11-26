import { Ionicons } from "@expo/vector-icons";
import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { StudyShell } from "@/src/components/study";
import { AppText, Button, Field, Input } from "@/src/components/ui";
import { EXAMS, EXAM_SUBJECTS, isIsoDate } from "@/src/lib/exams";
import { notify, toast } from "@/src/lib/feedback";
import { useStudentKind } from "@/src/lib/student-kind";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

export default function ExamGoalsScreen() {
  const colors = useTheme();
  const { isExamPrep, goals, loading, refresh } = useStudentKind();
  const [exams, setExams] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [school, setSchool] = useState("");
  const [course, setCourse] = useState("");
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setExams(goals.exams);
    setSubjects(goals.subjects);
    setDate(goals.date ?? "");
    setSchool(goals.school ?? "");
    setCourse(goals.course ?? "");
  }, [goals]);

  if (!loading && !isExamPrep) return <Redirect href="/(tabs)" />;

  function toggle(list: string[], set: (v: string[]) => void, v: string) {
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  }

  async function save() {
    setError(null);
    if (exams.length === 0) {
      setError("Choose at least one exam.");
      return;
    }
    if (date.trim() && !isIsoDate(date.trim())) {
      setError("Write the exam date as year-month-day, for example 2027-05-14.");
      return;
    }
    setSaving(true);
    const { error: err } = await supabase.rpc("save_exam_goals", {
      p_exams: exams,
      p_subjects: subjects,
      p_date: date.trim() || null,
      p_school: school.trim() || null,
      p_course: course.trim() || null,
    });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    await refresh();
    toast.success("Exam goals saved");
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }

  function admitted() {
    notify(
      "Switch to a school account?",
      "You'll pick your school and campus next, and your courses, timetable and CGPA tools will appear. Your Premium price changes to the school rate. This can't be undone.",
      [
        { text: "Not yet", style: "cancel" },
        {
          text: "Yes, I'm admitted",
          onPress: () => {
            void (async () => {
              setSwitching(true);
              const { error: err } = await supabase.rpc("switch_to_enrolled");
              if (err) {
                setSwitching(false);
                notify("Couldn't switch", err.message, undefined, { tone: "danger" });
                return;
              }
              await refresh();
              setSwitching(false);
              router.replace("/onboarding");
            })();
          },
        },
      ],
    );
  }

  const chip = (on: boolean) => ({
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: on ? colors.accent : colors.border,
    backgroundColor: on ? colors.accentSoft : colors.surface,
  });

  return (
    <StudyShell title="Exam goals" subtitle="We use this for your countdown, plan and tutor">
      <View style={{ gap: 8 }}>
        <AppText weight="700">Exams</AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {EXAMS.map((e) => {
            const on = exams.includes(e.key);
            return (
              <Pressable key={e.key} onPress={() => toggle(exams, setExams, e.key)} style={chip(on)}>
                <AppText size={13} weight={on ? "700" : "500"}>
                  {e.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <AppText weight="700">Subjects</AppText>
        <AppText muted size={12}>
          Tap the subjects you are writing.
        </AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {EXAM_SUBJECTS.map((s) => {
            const on = subjects.includes(s);
            return (
              <Pressable key={s} onPress={() => toggle(subjects, setSubjects, s)} style={chip(on)}>
                <AppText size={13} weight={on ? "700" : "500"}>
                  {s}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Field label="Exam date" hint="Year-month-day, for example 2027-05-14. Optional.">
        <Input
          placeholder="2027-05-14"
          value={date}
          onChangeText={setDate}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
        />
      </Field>
      <Field label="School you want" hint="Optional">
        <Input placeholder="e.g. University of Ibadan" value={school} onChangeText={setSchool} />
      </Field>
      <Field label="Course you want" hint="Optional">
        <Input placeholder="e.g. Medicine and Surgery" value={course} onChangeText={setCourse} />
      </Field>

      {error ? (
        <View style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radii.sm, padding: 12 }}>
          <AppText size={14} style={{ color: colors.danger }}>
            {error}
          </AppText>
        </View>
      ) : null}

      <Button title="Save goals" onPress={() => void save()} loading={saving} />

      <View style={{ backgroundColor: colors.surface, borderRadius: radii.lg, padding: 16, gap: 10, marginTop: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="school-outline" size={18} color={colors.fg} />
          <AppText weight="700">Got admitted?</AppText>
        </View>
        <AppText muted size={13}>
          Switch to a school account to set up your campus, courses and timetable.
        </AppText>
        <Button title="I have been admitted" variant="secondary" onPress={admitted} loading={switching} />
      </View>
    </StudyShell>
  );
}
