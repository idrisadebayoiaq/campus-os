import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Notice, PageShell, Section } from "@/src/components/page";
import { AppText, Button, Input } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { getStudentCampus } from "@/src/lib/campus";
import { notify } from "@/src/lib/feedback";
import { isStudentVerified, submitIdDocument, verifyWithSchoolEmail } from "@/src/lib/verification";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

export default function VerifyScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const [pending, setPending] = useState(false);
  const [schoolEmail, setSchoolEmail] = useState("");
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"email" | "id" | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [ok, pend, campus, sp] = await Promise.all([
      isStudentVerified(supabase, user.id),
      supabase
        .from("student_verifications")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle(),
      getStudentCampus(supabase, user.id),
      supabase.from("student_profiles").select("school_email").eq("user_id", user.id).maybeSingle(),
    ]);
    setVerified(ok);
    setPending(Boolean(pend.data?.id));
    setInstitutionId(campus?.institutionId || null);
    if (sp.data?.school_email) setSchoolEmail(sp.data.school_email);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onSchoolEmail() {
    if (!user || !schoolEmail.trim()) return;
    setBusy("email");
    const res = await verifyWithSchoolEmail(supabase, user.id, schoolEmail, institutionId);
    setBusy(null);
    if (!res.ok) {
      notify("Couldn't verify email", res.error, undefined, { tone: "danger" });
      return;
    }
    notify("You're verified", undefined, undefined, { tone: "success" });
    await refresh();
  }

  async function onId(fromCamera: boolean) {
    if (!user) return;
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notify(fromCamera ? "Camera access needed" : "Photo access needed", undefined, undefined, { tone: "warn" });
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.85 };
    const result = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (result.canceled || !result.assets[0]) return;
    setBusy("id");
    const res = await submitIdDocument(supabase, user.id, result.assets[0].uri, result.assets[0].mimeType);
    setBusy(null);
    if (!res.ok) {
      notify("Couldn't upload ID", res.error, undefined, { tone: "danger" });
      return;
    }
    notify("ID sent for review", "We'll notify you when it's checked.", undefined, { tone: "success" });
    await refresh();
  }

  const state = verified ? "verified" : pending ? "pending" : "none";
  const banner = {
    verified: { icon: "shield-checkmark" as const, color: colors.success, title: "You're verified", body: "Messaging, food orders and selling are unlocked." },
    pending: { icon: "time" as const, color: colors.warn, title: "ID under review", body: "We'll notify you when it's approved." },
    none: { icon: "shield-outline" as const, color: colors.accent, title: "Verify you're a student", body: "Unlocks messaging sellers, food orders and selling." },
  }[state];

  return (
    <PageShell title="Student ID" loading={loading} onRefresh={() => void refresh()}>
      <View style={[styles.banner, { backgroundColor: colors.heroBg }]}>
        <View style={[styles.icon, { backgroundColor: banner.color + "33" }]}>
          <Ionicons name={banner.icon} size={28} color={banner.color} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText size={18} weight="700" style={{ color: colors.heroFg }}>
            {banner.title}
          </AppText>
          <AppText size={13} style={{ color: colors.heroMuted }}>
            {banner.body}
          </AppText>
        </View>
      </View>

      {!verified ? (
        <>
          <Section title="School email" hint="Fastest. Verified instantly.">
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Input
                value={schoolEmail}
                onChangeText={setSchoolEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@school.edu.ng"
              />
              <Button title="Verify email" onPress={() => void onSchoolEmail()} loading={busy === "email"} disabled={!schoolEmail.trim() || busy !== null} />
            </View>
          </Section>

          <Section title="Student ID card" hint={pending ? "Send a clearer photo if needed." : "Checked by your school."}>
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <View style={styles.row}>
                <Button title="Take photo" onPress={() => void onId(true)} loading={busy === "id"} disabled={busy !== null} style={{ flex: 1 }} compact />
                <Button title="Upload" variant="secondary" onPress={() => void onId(false)} disabled={busy !== null} style={{ flex: 1 }} compact />
              </View>
            </View>
          </Section>

          <Notice icon="people-outline">Added to a class by a lecturer? You&apos;re verified automatically.</Notice>
        </>
      ) : null}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: radii.xl, padding: 18, flexDirection: "row", alignItems: "center", gap: 14 },
  icon: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: radii.lg, padding: 14, gap: 12 },
  row: { flexDirection: "row", gap: 10 },
});
