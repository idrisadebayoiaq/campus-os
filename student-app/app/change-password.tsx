import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, Button } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { notify, toast } from "@/src/lib/feedback";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

export default function ChangePasswordScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const longEnough = next.length >= 8;
  const hasNumber = /\d/.test(next);
  const matches = next.length > 0 && next === confirm;
  const canSave = current.length > 0 && longEnough && hasNumber && matches;

  async function save() {
    if (!user?.email || !canSave) return;
    setSaving(true);
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: current,
    });
    if (authErr) {
      setSaving(false);
      notify("Current password is incorrect", undefined, undefined, { tone: "danger" });
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    setSaving(false);
    if (error) {
      notify("Couldn't update password", error.message, undefined, { tone: "danger" });
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    toast.success("Password updated");
  }

  async function sendReset() {
    if (!user?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email);
    if (error) notify("Couldn't send link", error.message, undefined, { tone: "danger" });
    else toast.success("Reset link sent", user.email);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.top}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.back, { backgroundColor: colors.surface }]}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={20} color={colors.fg} />
        </Pressable>
        <AppText size={18} weight="700">
          Login & password
        </AppText>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 22, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.accountRow}>
              <View style={[styles.accountIcon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="mail-outline" size={18} color={colors.fg} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText muted size={12}>
                  Signed in as
                </AppText>
                <AppText size={15} weight="600" numberOfLines={1}>
                  {user?.email ?? ""}
                </AppText>
              </View>
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <View style={styles.sectionHead}>
              <AppText muted size={12} weight="600" style={{ marginLeft: 4 }}>
                CHANGE PASSWORD
              </AppText>
              <Pressable onPress={() => setShow((s) => !s)} hitSlop={8}>
                <AppText size={13} weight="600" style={{ color: colors.accent }}>
                  {show ? "Hide" : "Show"}
                </AppText>
              </Pressable>
            </View>
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Field
                label="Current password"
                value={current}
                onChange={setCurrent}
                autoComplete="current-password"
                show={show}
              />
              <Field
                label="New password"
                value={next}
                onChange={setNext}
                autoComplete="new-password"
                show={show}
              />
              <Field
                label="Confirm new password"
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
                show={show}
              />
              <View style={{ gap: 6, marginTop: 2 }}>
                <Rule ok={longEnough} text="At least 8 characters" />
                <Rule ok={hasNumber} text="Includes a number" />
                <Rule ok={matches} text="Both new passwords match" />
              </View>
            </View>
          </View>

          <Button title="Update password" onPress={save} loading={saving} disabled={!canSave} />

          <Pressable onPress={() => void sendReset()} style={{ alignSelf: "center" }}>
            <AppText size={14} weight="600" style={{ color: colors.accent }}>
              Forgot your current password?
            </AppText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  autoComplete,
  show,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  show: boolean;
}) {
  const colors = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <AppText size={13} weight="600">
        {label}
      </AppText>
      <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={autoComplete}
          style={[styles.input, { color: colors.fg }]}
        />
      </View>
    </View>
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
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  card: { borderRadius: radii.md, padding: 16, gap: 14 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingRight: 4 },
  accountRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  accountIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  inputWrap: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    minHeight: 50,
    justifyContent: "center",
  },
  input: { fontSize: 15, paddingVertical: 10 },
  rule: { flexDirection: "row", alignItems: "center", gap: 8 },
});
