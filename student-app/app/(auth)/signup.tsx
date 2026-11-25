import { Link, router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  AppText,
  Button,
  Checkbox,
  Field,
  Input,
  Screen,
} from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

export default function SignupScreen() {
  const { signUp, configured } = useAuth();
  const colors = useTheme();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    setMessage(null);
    if (!configured) {
      setError(
        "Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env",
      );
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setError("Enter your first and last name.");
      return;
    }
    if (!email.trim() || password.length < 6) {
      setError("Enter a valid email and a password of at least 6 characters.");
      return;
    }
    if (!terms) {
      setError(
        "Accept the Terms and Privacy notice to create a CampusOS account.",
      );
      return;
    }
    setLoading(true);
    const result = await signUp(email.trim(), password, {
      firstName,
      lastName,
      preferredName,
      marketing,
    });
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.needsConfirm) {
      setMessage("Check your email to confirm your account, then log in.");
      setTimeout(() => router.replace("/(auth)/login"), 2200);
      return;
    }
    router.replace("/onboarding");
  }

  const inner = { backgroundColor: colors.bg };

  return (
    <Screen>
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
            <AppText size={34} weight="700">
              CampusOS
            </AppText>
            <AppText muted size={15}>
              Create your student account. You will pick your campus next.
            </AppText>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Field label="First name">
                  <Input
                    autoComplete="given-name"
                    placeholder="Ada"
                    value={firstName}
                    onChangeText={setFirstName}
                    style={inner}
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
                    style={inner}
                  />
                </Field>
              </View>
            </View>
            <Field label="Preferred name (optional)">
              <Input
                autoComplete="nickname"
                placeholder="What should CampusOS call you?"
                value={preferredName}
                onChangeText={setPreferredName}
                style={inner}
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
                style={inner}
              />
            </Field>
            <Field label="Password">
              <Input
                secureTextEntry
                autoComplete="new-password"
                placeholder="At least 6 characters"
                value={password}
                onChangeText={setPassword}
                style={inner}
              />
            </Field>

            <View style={{ gap: 14, paddingTop: 4 }}>
              <Checkbox checked={terms} onChange={setTerms}>
                <AppText size={14} muted>
                  I agree to the CampusOS Terms of Service and acknowledge the
                  Privacy notice.
                </AppText>
              </Checkbox>
              <Checkbox checked={marketing} onChange={setMarketing}>
                <AppText size={14} muted>
                  Send me optional CampusOS tips and offers (not required).
                </AppText>
              </Checkbox>
            </View>

            {error ? (
              <AppText size={14} style={{ color: colors.danger }}>
                {error}
              </AppText>
            ) : null}
            {message ? (
              <AppText size={14} style={{ color: colors.success }}>
                {message}
              </AppText>
            ) : null}
            <Button
              title={loading ? "Creating account…" : "Create account"}
              onPress={onSubmit}
              loading={loading}
            />
          </View>

          <AppText muted size={14} style={{ textAlign: "center" }}>
            Already have an account?{" "}
            <Link
              href="/(auth)/login"
              style={{ color: colors.fg, fontWeight: "700" }}
            >
              Log in
            </Link>
          </AppText>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: "center",
    gap: 28,
    paddingVertical: 32,
  },
  card: {
    borderRadius: radii.xl,
    padding: 20,
    gap: 16,
  },
  row: { flexDirection: "row", gap: 12 },
});
