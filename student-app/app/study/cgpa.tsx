import { useState } from "react";
import { View } from "react-native";
import { AppText, Card, Field, Input } from "@/src/components/ui";
import { CrudScreen } from "@/src/components/study";
import { CACHE_KEYS } from "@/src/lib/offline";
import { calcCgpa, GRADE_POINTS_5, targetNeeded, type GradeEntry } from "@/src/lib/study";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

function Summary({ items }: { items: GradeEntry[] }) {
  const colors = useTheme();
  const { cgpa, credits } = calcCgpa(items);
  const [target, setTarget] = useState("");
  const [remaining, setRemaining] = useState("");

  const t = Number(target);
  const r = Number(remaining);
  const need =
    cgpa != null && t > 0 && r > 0 ? targetNeeded(cgpa, credits, t, r) : null;

  return (
    <View style={{ gap: 12 }}>
      <View
        style={{
          backgroundColor: colors.heroBg,
          borderRadius: radii.xl,
          padding: 22,
        }}
      >
        <AppText size={13} style={{ color: colors.heroMuted }}>
          Current CGPA (5.0 scale)
        </AppText>
        <AppText size={44} weight="700" style={{ color: colors.heroFg, marginTop: 4 }}>
          {cgpa != null ? cgpa.toFixed(2) : "—"}
        </AppText>
        <AppText size={13} style={{ color: colors.heroMuted }}>
          {credits} credit units · {items.length} course{items.length === 1 ? "" : "s"}
        </AppText>
      </View>

      <Card style={{ gap: 12 }}>
        <AppText weight="700">Target planner</AppText>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="Target CGPA">
              <Input
                value={target}
                onChangeText={setTarget}
                placeholder="4.50"
                keyboardType="decimal-pad"
              />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Units left">
              <Input
                value={remaining}
                onChangeText={setRemaining}
                placeholder="60"
                keyboardType="decimal-pad"
              />
            </Field>
          </View>
        </View>
        {need != null ? (
          <AppText
            size={14}
            style={need > 5 ? { color: colors.danger } : undefined}
            muted={need <= 5}
          >
            {need > 5
              ? `You'd need ${need.toFixed(2)} average — above the 5.0 maximum.`
              : need <= 0
                ? "You're already on track for this target."
                : `You need an average of ${need.toFixed(2)} on your remaining units.`}
          </AppText>
        ) : (
          <AppText muted size={13}>
            Enter a target and remaining units to see what you need.
          </AppText>
        )}
      </Card>
    </View>
  );
}

export default function CgpaScreen() {
  return (
    <CrudScreen<GradeEntry>
      title="CGPA"
      subtitle="Grades and standing"
      table="grade_entries"
      cacheKey={CACHE_KEYS.grades}
      fields={[
        { key: "course_code", label: "Course code", placeholder: "CSC 201", required: true },
        { key: "course_title", label: "Title" },
        { key: "credit_units", label: "Credit units", type: "number", required: true, placeholder: "3" },
        {
          key: "grade",
          label: "Grade",
          type: "select",
          required: true,
          options: Object.keys(GRADE_POINTS_5).map((g) => ({ label: g, value: g })),
        },
        { key: "semester", label: "Semester", placeholder: "2025/2026 First" },
      ]}
      addLabel="Add grade"
      transformDraft={(d) => ({
        ...d,
        course_code: String(d.course_code).toUpperCase(),
        grade_point: GRADE_POINTS_5[String(d.grade).toUpperCase()] ?? null,
      })}
      header={(items) => <Summary items={items} />}
      emptyTitle="No grades yet"
      emptyBody="Add results to calculate your CGPA."
      renderItem={(g) => ({
        title: `${g.course_code} · ${g.grade}`,
        subtitle: g.course_title ?? undefined,
        meta: [
          g.credit_units != null ? `${g.credit_units} units` : null,
          g.semester,
        ]
          .filter(Boolean)
          .join(" · "),
      })}
    />
  );
}
