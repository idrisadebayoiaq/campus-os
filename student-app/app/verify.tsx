import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText, Button, Card, Field, Input } from "@/src/components/ui";
import { StudyShell, SyncBanner } from "@/src/components/study";
import { useAuth } from "@/src/lib/auth";
import { getStudentCampus } from "@/src/lib/campus";
import {
  isStudentVerified,
  submitIdDocument,
  verifyWithSchoolEmail,
} from "@/src/lib/verification";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

export default function VerifyScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const [verified, setVerified] = useState(false);
  const [pending, setPending] = useState(false);
  const [schoolEmail, setSchoolEmail] = useState("");
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const ok = await isStudentVerified(supabase, user.id);
    setVerified(ok);
    const { data: pend } = await supabase
      .from("student_verifications")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();
    setPending(Boolean(pend?.id));
    const campus = await getStudentCampus(supabase, user.id);
    setInstitutionId(campus?.institutionId || null);
    const { data: sp } = await supabase
      .from("student_profiles")
      .select("school_email")
      .eq("user_id", user.id)
      .maybeSingle();
    if (sp?.school_email) setSchoolEmail(sp.school_email);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onSchoolEmail() {
    if (!user) return;
    setBusy(true);
    setStatus(null);
    setError(null);
    const res = await verifyWithSchoolEmail(
      supabase,
      user.id,
      schoolEmail,
      institutionId,
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setStatus("Verified with school email.");
    await refresh();
  }

  async function submitAsset(uri: string, mimeType?: string | null) {
    if (!user) return;
    setBusy(true);
    setStatus(null);
    setError(null);
    const res = await submitIdDocument(supabase, user.id, uri, mimeType);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setStatus("ID submitted — waiting for school review.");
    await refresh();
  }

  async function onUploadId() {
    if (!user) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Photo permission required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    await submitAsset(result.assets[0].uri, result.assets[0].mimeType);
  }

  async function onCameraId() {
    if (!user) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError("Camera permission required.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    await submitAsset(result.assets[0].uri, result.assets[0].mimeType);
  }

  return (
    <StudyShell
      title="Verify student"
      subtitle="Unlock messaging, food orders, and selling"
      banner={<SyncBanner error={error} notice={status} />}
    >
      <View
        style={{
          backgroundColor: colors.heroBg,
          borderRadius: radii.xl,
          padding: 20,
          gap: 6,
        }}
      >
        <AppText size={13} style={{ color: colors.heroMuted }}>
          One-time verification
        </AppText>
        <AppText size={18} weight="700" style={{ color: colors.heroFg }}>
          School email, staff invite, or student ID
        </AppText>
        <AppText size={13} style={{ color: colors.heroMuted }}>
          Browse stays open; seller messaging and selling stay locked until verified.
        </AppText>
      </View>

      {verified ? (
        <Card style={{ gap: 10, alignItems: "flex-start" }}>
          <Ionicons name="shield-checkmark" size={28} color={colors.success} />
          <AppText weight="700" size={17}>
            You are verified
          </AppText>
          <AppText muted size={13}>
            Messaging sellers, food orders, and selling are unlocked.
          </AppText>
        </Card>
      ) : (
        <>
          {pending ? (
            <Card style={{ gap: 8 }}>
              <AppText weight="700">ID under review</AppText>
              <AppText muted size={13}>
                Your school authority will approve or reject soon.
              </AppText>
            </Card>
          ) : null}

          <Card style={{ gap: 12 }}>
            <AppText weight="700">School email</AppText>
            <Field label="Campus email">
              <Input
                value={schoolEmail}
                onChangeText={setSchoolEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@school.edu.ng"
              />
            </Field>
            <Button
              title="Verify with email"
              onPress={onSchoolEmail}
              loading={busy}
            />
          </Card>

          <Card style={{ gap: 10 }}>
            <AppText weight="700">Upload student ID</AppText>
            <AppText muted size={13}>
              Photo of your campus ID card for school review.
            </AppText>
            <Button
              title="Choose photo"
              variant="secondary"
              onPress={onUploadId}
              loading={busy}
            />
            <Button
              title="Take photo"
              variant="ghost"
              onPress={onCameraId}
              disabled={busy}
            />
          </Card>

          <Card style={{ gap: 8 }}>
            <AppText weight="700">Staff invite</AppText>
            <AppText muted size={13}>
              If a lecturer or school authority adds you to a class, you are
              verified automatically — no ID needed again.
            </AppText>
          </Card>
        </>
      )}
    </StudyShell>
  );
}
