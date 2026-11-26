import { Ionicons } from "@expo/vector-icons";
import { Link, router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AuthShell } from "@/src/components/auth-shell";
import { LocationField, LocationPicker, type PickedLocation } from "@/src/components/location-picker";
import {
  AppText,
  Button,
  Checkbox,
  Field,
  Input,
  PasswordInput,
} from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupScreen() {
  const { signUp, configured } = useAuth();
  const colors = useTheme();
  const [step, setStep] = useState<1 | 2>(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [picking, setPicking] = useState(false);
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const longEnough = password.length >= 8;
  const hasNumber = /\d/.test(password);

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
    setStep(2);
  }

  async function onSubmit() {
    setError(null);
    setMessage(null);
    if (!configured) {
      setError("Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env");
      return;
    }
    if (!location) {
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
      location: { label: location.label, lat: location.lat, lng: location.lng },
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
    router.replace("/onboarding");
  }

  const errorBanner = error ? (
    <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.danger }]}>
      <AppText size={14} style={{ color: colors.danger }}>
        {error}
      </AppText>
    </View>
  ) : null;

  if (step === 1) {
    return (
      <AuthShell
        title="Create your account"
        subtitle="Join students finding rooms, food, study tools and classmates."
        step={{ current: 1, total: 2, label: "About you" }}
      >
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
            placeholder="you@school.edu.ng"
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

        <AppText muted size={14} style={{ textAlign: "center" }}>
          Already have an account?{" "}
          <Link href="/(auth)/login" style={{ color: colors.fg, fontWeight: "700" }}>
            Log in
          </Link>
        </AppText>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Where are you based?"
      subtitle="We'll show schools, housing and places around this location."
      step={{ current: 2, total: 2, label: "Your location" }}
    >
      <Pressable onPress={() => setStep(1)} style={styles.backLink} hitSlop={8}>
        <Ionicons name="arrow-back" size={16} color={colors.muted} />
        <AppText size={13} muted weight="600">
          Back to your details
        </AppText>
      </Pressable>

      {location ? (
        <Field label="Your location">
          <LocationField value={location.label} onPress={() => setPicking(true)} />
        </Field>
      ) : (
        <View style={[styles.locCard, { backgroundColor: colors.surface }]}>
          <View style={[styles.locIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="navigate" size={22} color={colors.fg} />
          </View>
          <AppText size={16} weight="700">
            Use your location
          </AppText>
          <AppText size={14} muted style={{ lineHeight: 20 }}>
            We&apos;ll ask for permission to find you on the map. You can move the
            pin or search for your street, hostel or area.
          </AppText>
          <Button title="Allow & choose on map" onPress={() => setPicking(true)} />
        </View>
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
        disabled={!terms || !location}
      />

      <LocationPicker
        visible={picking}
        title="Your location"
        initial={location}
        onClose={() => setPicking(false)}
        onConfirm={(place) => {
          setLocation(place);
          setPicking(false);
          setError(null);
        }}
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
  locCard: { borderRadius: radii.lg, padding: 20, gap: 10 },
  locIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  consent: { borderWidth: 1, borderRadius: radii.md, padding: 16, gap: 14 },
});
