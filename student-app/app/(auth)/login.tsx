import { Link, router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AuthShell } from "@/src/components/auth-shell";
import { AppText, Button, Field, Input, PasswordInput } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

export default function LoginScreen() {
  const { signIn, configured } = useAuth();
  const colors = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    setNotice(null);
    if (!configured) {
      setError("Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env");
      return;
    }
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    const result = await signIn(email.trim(), password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.replace("/(tabs)");
  }

  async function onForgot() {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError("Type your email above first, then tap Forgot password.");
      return;
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (resetError) setError(resetError.message);
    else setNotice(`We sent a reset link to ${email.trim()}.`);
  }

  return (
    <AuthShell title="Welcome back" subtitle="Log in to your housing, classes and campus inbox.">
      <Field label="Email">
        <Input
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@school.edu.ng"
          value={email}
          onChangeText={setEmail}
          returnKeyType="next"
        />
      </Field>
      <View style={{ gap: 8 }}>
        <View style={styles.labelRow}>
          <AppText weight="600" size={14}>
            Password
          </AppText>
          <Pressable onPress={() => void onForgot()} hitSlop={8}>
            <AppText size={13} weight="600" style={{ color: colors.fg, opacity: 0.75 }}>
              Forgot password?
            </AppText>
          </Pressable>
        </View>
        <PasswordInput
          autoComplete="password"
          placeholder="Your password"
          value={password}
          onChangeText={setPassword}
          returnKeyType="go"
          onSubmitEditing={() => void onSubmit()}
        />
      </View>

      {error ? (
        <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.danger }]}>
          <AppText size={14} style={{ color: colors.danger }}>
            {error}
          </AppText>
        </View>
      ) : null}
      {notice ? (
        <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.success }]}>
          <AppText size={14} style={{ color: colors.success }}>
            {notice}
          </AppText>
        </View>
      ) : null}

      <Button title="Log in" onPress={() => void onSubmit()} loading={loading} />

      <View style={styles.divider}>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
        <AppText size={12} muted>
          NEW TO CAMPUSOS?
        </AppText>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
      </View>

      <Button
        title="Create a student account"
        variant="secondary"
        onPress={() => router.push("/(auth)/signup")}
      />

      <AppText muted size={12} style={styles.legal}>
        By continuing you agree to our{" "}
        <Link href="/legal/terms" style={{ color: colors.fg, fontWeight: "600" }}>
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/legal/privacy" style={{ color: colors.fg, fontWeight: "600" }}>
          Privacy Policy
        </Link>
        .
      </AppText>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  banner: { borderRadius: radii.sm, borderWidth: 1, padding: 12 },
  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  legal: { textAlign: "center", lineHeight: 18 },
});
