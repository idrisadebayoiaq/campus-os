import { Link, router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { AppText, Button, Field, Input, Screen } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { useTheme } from "@/src/theme/ThemeProvider";

export default function SignupScreen() {
  const { signUp, configured } = useAuth();
  const colors = useTheme();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setLoading(true);
    setError(null);
    setMessage(null);
    if (!configured) {
      setLoading(false);
      setError(
        "Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env",
      );
      return;
    }
    const result = await signUp(email.trim(), password, fullName.trim());
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.needsConfirm) {
      setMessage("Check your email to confirm your account, then log in.");
      return;
    }
    router.replace("/(tabs)");
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: 8 }}>
            <AppText muted size={14} weight="500">
              Get started
            </AppText>
            <AppText size={28} weight="700">
              Create your student account
            </AppText>
            <AppText muted>
              Pick your school on the CampusOS website anytime after signup.
            </AppText>
          </View>

          <View
            style={[
              styles.card,
              { borderColor: colors.border, backgroundColor: colors.bg },
            ]}
          >
            <Field label="Full name">
              <Input
                autoComplete="name"
                placeholder="Ada Okonkwo"
                value={fullName}
                onChangeText={setFullName}
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
              <Input
                secureTextEntry
                autoComplete="new-password"
                placeholder="At least 6 characters"
                value={password}
                onChangeText={setPassword}
              />
            </Field>
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

          <AppText muted size={14}>
            Already have an account?{" "}
            <Link
              href="/(auth)/login"
              style={{ color: colors.fg, fontWeight: "600" }}
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
    gap: 24,
    paddingVertical: 32,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
});
