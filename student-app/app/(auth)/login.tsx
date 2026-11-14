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

export default function LoginScreen() {
  const { signIn, configured } = useAuth();
  const colors = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setLoading(true);
    setError(null);
    if (!configured) {
      setLoading(false);
      setError(
        "Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env",
      );
      return;
    }
    const result = await signIn(email.trim(), password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
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
              Student access
            </AppText>
            <AppText size={28} weight="700">
              Welcome back
            </AppText>
            <AppText muted>
              Log in to housing, study tools, and your campus inbox.
            </AppText>
          </View>

          <View
            style={[
              styles.card,
              { borderColor: colors.border, backgroundColor: colors.bg },
            ]}
          >
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
                autoComplete="password"
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
              />
            </Field>
            {error ? (
              <AppText size={14} style={{ color: colors.danger }}>
                {error}
              </AppText>
            ) : null}
            <Button
              title={loading ? "Signing in…" : "Log in"}
              onPress={onSubmit}
              loading={loading}
            />
          </View>

          <AppText muted size={14}>
            New here?{" "}
            <Link
              href="/(auth)/signup"
              style={{ color: colors.fg, fontWeight: "600" }}
            >
              Create a student account
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
