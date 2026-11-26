import { Ionicons } from "@expo/vector-icons";
import { Link, router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AuthShell } from "@/src/components/auth-shell";
import type { PickedLocation } from "@/src/components/location-picker";
import { LocationSearch } from "@/src/components/location-search";
import {
  AppText,
  Button,
  Checkbox,
  Field,
  Input,
  PasswordInput,
} from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { EXAMS } from "@/src/lib/exams";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Kind = "enrolled" | "exam_prep";
type Step = "kind" | "details" | "final";

const KIND_OPTIONS: {
  key: Kind;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
  perks: string[];
}[] = [
  {
    key: "enrolled",
    icon: "school-outline",
    title: "I'm already in school",
    text: "University, polytechnic or college student.",
    perks: ["Courses, timetable and CGPA", "Classes, housing and food near campus", "AI tutor, free with daily limits"],
  },
  {
    key: "exam_prep",
    icon: "ribbon-outline",
    title: "I'm preparing for an exam",
    text: "JAMB, WAEC, NECO, Post-UTME or similar.",
    perks: ["Exam countdown and study plan", "Flashcards, notes and study groups", "AI tutor and past questions with Premium"],
  },
];

export default function SignupScreen() {
  const { signUp, configured } = useAuth();
  const colors = useTheme();
  const [step, setStep] = useState<Step>("kind");
  const [kind, setKind] = useState<Kind | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [exams, setExams] = useState<string[]>([]);
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const longEnough = password.length >= 8;
  const hasNumber = /\d/.test(password);
  const examPrep = kind === "exam_prep";
  const stepNo = step === "kind" ? 1 : step === "details" ? 2 : 3;

  function chooseKind() {
    setError(null);
    if (!kind) {
      setError("Pick the option that fits you to continue.");
      return;
    }
    setStep("details");
  }

  function nextStep() {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError("Enter your first and last name.");
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (!longEnough || !hasNumber) {
      setError("Use a password with at least 8 characters and a number.");
      return;
    }
    setStep("final");
  }

  function toggleExam(key: string) {
    setError(null);
    setExams((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }

  async function onSubmit() {
    setError(null);
    setMessage(null);
    if (!configured) {
      setError("Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env");
      return;
    }
    if (examPrep && exams.length === 0) {
      setError("Choose at least one exam you are preparing for.");
      return;
    }
    if (!examPrep && !location) {
      setError("Choose your location so we can show schools and places near you.");
      return;
    }
    if (!terms) {
      setError("Please agree to the Terms of Service and Privacy Policy.");
      return;
    }
    setLoading(true);
    const result = await signUp(email.trim(), password, {
      firstName,
      lastName,
      preferredName,
      marketing,
      location: location ? { label: location.label, lat: location.lat, lng: location.lng } : null,
      studentKind: examPrep ? "exam_prep" : "enrolled",
      exams: examPrep ? exams : [],
    });
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.needsConfirm) {
      setMessage("Check your email to confirm your account, then log in.");
      setTimeout(() => router.replace("/(auth)/login"), 2400);
      return;
    }
    router.replace(examPrep ? "/(tabs)" : "/onboarding");
  }

  const errorBanner = error ? (
    <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.danger }]}>
      <AppText size={14} style={{ color: colors.danger }}>
        {error}
      </AppText>
    </View>
  ) : null;

  if (step === "kind") {
    return (
      <AuthShell
        title="How will you use CampusOS?"
        subtitle="Pick the one that fits you today. We set up the right tools for you, and you can switch later."
        step={{ current: 1, total: 3, label: "Your path" }}
      >
        {KIND_OPTIONS.map((o) => {
          const on = kind === o.key;
          return (
            <Pressable
              key={o.key}
              onPress={() => {
                setKind(o.key);
                setError(null);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={[
                styles.kindCard,
                {
                  backgroundColor: on ? colors.accentSoft : colors.surface,
                  borderColor: on ? colors.accent : colors.border,
                },
              ]}
            >
              <View style={styles.kindHead}>
                <View style={[styles.kindIcon, { backgroundColor: on ? colors.accent : colors.soft }]}>
                  <Ionicons name={o.icon} size={22} color={on ? colors.onAccent : colors.fg} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText weight="700" size={16}>
                    {o.title}
                  </AppText>
                  <AppText muted size={13}>
                    {o.text}
                  </AppText>
                </View>
                <Ionicons
                  name={on ? "radio-button-on" : "radio-button-off"}
                  size={22}
                  color={on ? colors.accent : colors.muted}
                />
              </View>
              <View style={{ gap: 6, marginTop: 12 }}>
                {o.perks.map((p) => (
                  <View key={p} style={styles.perk}>
                    <Ionicons name="checkmark" size={15} color={colors.success} />
                    <AppText size={13}>{p}</AppText>
                  </View>
                ))}
              </View>
            </Pressable>
          );
        })}

        {errorBanner}

        <Button title="Continue" onPress={chooseKind} />

        <AppText muted size={14} style={{ textAlign: "center" }}>
          Already have an account?{" "}
          <Link href="/(auth)/login" style={{ color: colors.fg, fontWeight: "700" }}>
            Log in
          </Link>
        </AppText>
      </AuthShell>
    );
  }

  if (step === "details") {
    return (
      <AuthShell
        title="Create your account"
        subtitle={
          examPrep
            ? "Join students getting ready for their exams."
            : "Join students finding rooms, food, study tools and classmates."
        }
        step={{ current: 2, total: 3, label: "About you" }}
      >
        <Pressable onPress={() => setStep("kind")} style={styles.backLink} hitSlop={8}>
          <Ionicons name="arrow-back" size={16} color={colors.muted} />
          <AppText size={13} muted weight="600">
            {examPrep ? "Preparing for an exam" : "Already in school"} · change
          </AppText>
        </Pressable>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label="First name">
              <Input
                autoComplete="given-name"
                placeholder="Ada"
                value={firstName}
                onChangeText={setFirstName}
              />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Last name">
              <Input
                autoComplete="family-name"
                placeholder="Okonkwo"
                value={lastName}
                onChangeText={setLastName}
              />
            </Field>
          </View>
        </View>
        <Field label="Preferred name" hint="Optional. What should CampusOS call you?">
          <Input
            autoComplete="nickname"
            placeholder="e.g. Ada"
            value={preferredName}
            onChangeText={setPreferredName}
          />
        </Field>
        <Field label="Email">
          <Input
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder={examPrep ? "you@gmail.com" : "you@school.edu.ng"}
            value={email}
            onChangeText={setEmail}
          />
        </Field>
        <Field label="Password">
          <PasswordInput
            autoComplete="new-password"
            placeholder="Create a password"
            value={password}
            onChangeText={setPassword}
          />
        </Field>
        <View style={styles.rules}>
          <Rule ok={longEnough} text="At least 8 characters" />
          <Rule ok={hasNumber} text="Includes a number" />
        </View>

        {errorBanner}

        <Button title="Continue" onPress={nextStep} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={examPrep ? "Which exam are you writing?" : "Where are you based?"}
      subtitle={
        examPrep
          ? "Choose all that apply. We build your countdown and study plan from this."
          : "We'll show schools, housing and places around this location."
      }
      step={{ current: 3, total: 3, label: examPrep ? "Your exams" : "Your location" }}
    >
      <Pressable onPress={() => setStep("details")} style={styles.backLink} hitSlop={8}>
        <Ionicons name="arrow-back" size={16} color={colors.muted} />
        <AppText size={13} muted weight="600">
          Back to your details
        </AppText>
      </Pressable>

      {examPrep ? (
        <View style={{ gap: 10 }}>
          {EXAMS.map((e) => {
            const on = exams.includes(e.key);
            return (
              <Pressable
                key={e.key}
                onPress={() => toggleExam(e.key)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={[
                  styles.examRow,
                  {
                    backgroundColor: on ? colors.accentSoft : colors.surface,
                    borderColor: on ? colors.accent : colors.border,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <AppText weight="600" size={15}>
                    {e.label}
                  </AppText>
                  <AppText muted size={12}>
                    {e.blurb}
                  </AppText>
                </View>
                <Ionicons
                  name={on ? "checkbox" : "square-outline"}
                  size={22}
                  color={on ? colors.accent : colors.muted}
                />
              </Pressable>
            );
          })}
          <AppText muted size={12}>
            You can add your subjects, exam date and the school you want after you sign up.
          </AppText>
        </View>
      ) : (
        <Field
          label="Your location"
          hint="Search and tap your area, street or hostel, or use your current location."
        >
          <LocationSearch
            value={location}
            onChange={(place) => {
              setLocation(place);
              if (place) setError(null);
            }}
          />
        </Field>
      )}

      <View style={[styles.consent, { borderColor: colors.border }]}>
        <Checkbox checked={terms} onChange={setTerms}>
          <AppText size={14} style={{ lineHeight: 20 }}>
            I agree to the{" "}
            <Text
              style={{ fontWeight: "700", textDecorationLine: "underline" }}
              onPress={() => router.push("/legal/terms")}
            >
              Terms of Service
            </Text>{" "}
            and{" "}
            <Text
              style={{ fontWeight: "700", textDecorationLine: "underline" }}
              onPress={() => router.push("/legal/privacy")}
            >
              Privacy Policy
            </Text>
            .
          </AppText>
        </Checkbox>
        <Checkbox checked={marketing} onChange={setMarketing}>
          <AppText size={14} muted style={{ lineHeight: 20 }}>
            Send me tips and offers (optional).
          </AppText>
        </Checkbox>
      </View>

      {errorBanner}
      {message ? (
        <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.success }]}>
          <AppText size={14} style={{ color: colors.success }}>
            {message}
          </AppText>
        </View>
      ) : null}

      <Button
        title="Create account"
        onPress={() => void onSubmit()}
        loading={loading}
        disabled={!terms || (examPrep ? exams.length === 0 : !location)}
      />
    </AuthShell>
  );
}

function Rule({ ok, text }: { ok: boolean; text: string }) {
  const colors = useTheme();
  return (
    <View style={styles.rule}>
      <Ionicons
        name={ok ? "checkmark-circle" : "ellipse-outline"}
        size={16}
        color={ok ? colors.success : colors.muted}
      />
      <AppText size={13} muted={!ok}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12 },
  rules: { gap: 6, marginTop: -6 },
  rule: { flexDirection: "row", alignItems: "center", gap: 8 },
  banner: { borderRadius: radii.sm, borderWidth: 1, padding: 12 },
  backLink: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  consent: { borderWidth: 1, borderRadius: radii.md, padding: 16, gap: 14 },
  kindCard: { borderWidth: 1.5, borderRadius: radii.md, padding: 16 },
  kindHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  kindIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  perk: { flexDirection: "row", alignItems: "center", gap: 8 },
  examRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1.5,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
