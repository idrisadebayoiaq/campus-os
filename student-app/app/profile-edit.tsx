import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AppText,
  Avatar,
  Button,
  Checkbox,
  Chip,
  Field,
  Input,
} from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

const HOUSING_STATUS = [
  { value: "need_room", label: "Need a room" },
  { value: "moving_soon", label: "Moving soon" },
  { value: "housed", label: "Already housed" },
  { value: "exploring", label: "Exploring" },
];

type Status = { kind: "ok" | "error"; text: string } | null;

function numOrNull(v: string) {
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function ProfileEditScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [level, setLevel] = useState("");
  const [department, setDepartment] = useState("");
  const [programme, setProgramme] = useState("");
  const [session, setSession] = useState("");
  const [semester, setSemester] = useState("");
  const [targetCgpa, setTargetCgpa] = useState("");
  const [housingStatus, setHousingStatus] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [budgetPeriod, setBudgetPeriod] = useState("year");
  const [alerts, setAlerts] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [saving, setSaving] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, Status>>({});

  const setSectionStatus = useCallback((key: string, s: Status) => {
    setStatus((prev) => ({ ...prev, [key]: s }));
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      const [profileRes, studentRes, housingRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("first_name, last_name, preferred_name, full_name, avatar_url")
          .eq("id", user!.id)
          .maybeSingle(),
        supabase
          .from("student_profiles")
          .select("*")
          .eq("user_id", user!.id)
          .maybeSingle(),
        supabase
          .from("housing_preferences")
          .select("*")
          .eq("user_id", user!.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const p = profileRes.data;
      const s = studentRes.data as Record<string, unknown> | null;
      const h = housingRes.data as Record<string, unknown> | null;

      let first = p?.first_name || "";
      let last = p?.last_name || "";
      if (!first && !last && p?.full_name) {
        const parts = String(p.full_name).trim().split(/\s+/);
        first = parts[0] || "";
        last = parts.slice(1).join(" ");
      }
      setFirstName(first);
      setLastName(last);
      setPreferredName(p?.preferred_name || "");
      setAvatarUrl(p?.avatar_url || null);
      setLevel(String(s?.academic_level ?? ""));
      setDepartment(String(s?.department_name ?? ""));
      setProgramme(String(s?.programme_name ?? ""));
      setSession(String(s?.academic_session ?? ""));
      setSemester(String(s?.current_semester ?? ""));
      setTargetCgpa(s?.target_cgpa ? String(s.target_cgpa) : "");
      setHousingStatus(String(h?.housing_status ?? ""));
      setMaxBudget(h?.max_budget ? String(h.max_budget) : "");
      setBudgetPeriod(String(h?.budget_period ?? "year"));
      setAlerts(Boolean(h?.alerts_enabled));
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const inner = { backgroundColor: colors.bg };

  const displayName =
    preferredName.trim() ||
    `${firstName} ${lastName}`.trim() ||
    "Student";

  async function uploadAvatarAsset(asset: ImagePicker.ImagePickerAsset) {
    if (!user) return;
    setSaving("photo");
    setSectionStatus("photo", null);
    try {
      const ext =
        asset.mimeType?.includes("png")
          ? "png"
          : asset.mimeType?.includes("webp")
            ? "webp"
            : "jpg";
      const contentType =
        asset.mimeType || `image/${ext === "jpg" ? "jpeg" : ext}`;
      const path = `${user.id}/${Date.now()}.${ext}`;
      const response = await fetch(asset.uri);
      const buffer = await response.arrayBuffer();
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, buffer, { contentType, upsert: true });
      if (uploadError) throw uploadError;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${pub.publicUrl}?t=${Date.now()}`;
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ avatar_url: pub.publicUrl })
        .eq("id", user.id);
      if (updateErr) {
        const { error: insertErr } = await supabase.from("profiles").insert({
          id: user.id,
          avatar_url: pub.publicUrl,
        });
        if (insertErr) throw insertErr;
      }
      setAvatarUrl(url);
      setSectionStatus("photo", { kind: "ok", text: "Photo updated." });
    } catch (e) {
      setSectionStatus("photo", {
        kind: "error",
        text: e instanceof Error ? e.message : "Upload failed.",
      });
    } finally {
      setSaving(null);
    }
  }

  async function pickAvatarFromLibrary() {
    if (!user) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setSectionStatus("photo", {
        kind: "error",
        text: "Photo library permission is required.",
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    await uploadAvatarAsset(result.assets[0]);
  }

  async function takeAvatarPhoto() {
    if (!user) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setSectionStatus("photo", {
        kind: "error",
        text: "Camera permission is required.",
      });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    await uploadAvatarAsset(result.assets[0]);
  }

  function statusLine(k: string) {
    const s = status[k];
    if (!s) return null;
    return (
      <AppText
        size={13}
        style={{ color: s.kind === "ok" ? colors.success : colors.danger }}
      >
        {s.text}
      </AppText>
    );
  }

  async function saveName() {
    if (!user) return;
    setSaving("name");
    setSectionStatus("name", null);
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const payload = {
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      preferred_name: preferredName.trim() || null,
      full_name: fullName || null,
    };
    let { error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", user.id);
    if (error) {
      ({ error } = await supabase
        .from("profiles")
        .insert({ id: user.id, ...payload }));
    }
    setSaving(null);
    setSectionStatus(
      "name",
      error
        ? { kind: "error", text: error.message }
        : { kind: "ok", text: "Name saved." },
    );
  }

  async function saveAcademic() {
    if (!user) return;
    setSaving("academic");
    setSectionStatus("academic", null);
    const academicPayload = {
      academic_level: level.trim() || null,
      department_name: department.trim() || null,
      programme_name: programme.trim() || null,
      academic_session: session.trim() || null,
      current_semester: semester.trim() || null,
      target_cgpa: numOrNull(targetCgpa),
      updated_at: new Date().toISOString(),
    };
    let { error } = await supabase
      .from("student_profiles")
      .update(academicPayload)
      .eq("user_id", user.id);
    if (error) {
      ({ error } = await supabase
        .from("student_profiles")
        .insert({ user_id: user.id, ...academicPayload }));
    }
    // Update with 0 rows still returns no error — ensure a row exists.
    if (!error) {
      const { data: existing } = await supabase
        .from("student_profiles")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!existing) {
        ({ error } = await supabase
          .from("student_profiles")
          .insert({ user_id: user.id, ...academicPayload }));
      }
    }
    setSaving(null);
    setSectionStatus(
      "academic",
      error
        ? { kind: "error", text: error.message }
        : { kind: "ok", text: "Academic profile saved." },
    );
  }

  async function saveHousing() {
    if (!user) return;
    setSaving("housing");
    setSectionStatus("housing", null);
    const housingPayload = {
      housing_status: housingStatus || null,
      max_budget: numOrNull(maxBudget),
      budget_period: budgetPeriod,
      alerts_enabled: alerts,
      updated_at: new Date().toISOString(),
    };
    let { error } = await supabase
      .from("housing_preferences")
      .update(housingPayload)
      .eq("user_id", user.id);
    if (error) {
      ({ error } = await supabase
        .from("housing_preferences")
        .insert({ user_id: user.id, ...housingPayload }));
    }
    if (!error) {
      const { data: existing } = await supabase
        .from("housing_preferences")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!existing) {
        ({ error } = await supabase
          .from("housing_preferences")
          .insert({ user_id: user.id, ...housingPayload }));
      }
    }
    setSaving(null);
    setSectionStatus(
      "housing",
      error
        ? { kind: "error", text: error.message }
        : { kind: "ok", text: "Housing preferences saved." },
    );
  }

  async function changePassword() {
    setSectionStatus("password", null);
    if (newPassword.length < 6) {
      setSectionStatus("password", {
        kind: "error",
        text: "Password must be at least 6 characters.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setSectionStatus("password", {
        kind: "error",
        text: "Passwords do not match.",
      });
      return;
    }
    setSaving("password");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(null);
    if (error) {
      setSectionStatus("password", { kind: "error", text: error.message });
      return;
    }
    setNewPassword("");
    setConfirmPassword("");
    setSectionStatus("password", { kind: "ok", text: "Password updated." });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="arrow-back" size={20} color={colors.fg} />
        </Pressable>
        <AppText size={20} weight="700">
          Edit profile
        </AppText>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <AppText size={17} weight="700">
              Profile photo
            </AppText>
            <View style={styles.photoRow}>
              <Avatar label={displayName} size={88} uri={avatarUrl} />
              <View style={{ flex: 1, gap: 8 }}>
                <AppText muted size={13}>
                  Upload a square photo so it looks sharp on your profile.
                </AppText>
                <Button
                  title={saving === "photo" ? "Uploading…" : "Choose photo"}
                  variant="secondary"
                  onPress={pickAvatarFromLibrary}
                  loading={saving === "photo"}
                />
                <Button
                  title="Take photo"
                  variant="ghost"
                  onPress={takeAvatarPhoto}
                  disabled={saving === "photo"}
                />
              </View>
            </View>
            {statusLine("photo")}
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <AppText size={17} weight="700">
              Name
            </AppText>
            <Field label="First name">
              <Input value={firstName} onChangeText={setFirstName} style={inner} />
            </Field>
            <Field label="Last name">
              <Input value={lastName} onChangeText={setLastName} style={inner} />
            </Field>
            <Field label="Preferred name">
              <Input
                value={preferredName}
                onChangeText={setPreferredName}
                placeholder="What should CampusOS call you?"
                style={inner}
              />
            </Field>
            {statusLine("name")}
            <Button title="Save name" onPress={saveName} loading={saving === "name"} />
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <AppText size={17} weight="700">
              Academic
            </AppText>
            <Field label="Level">
              <Input value={level} onChangeText={setLevel} placeholder="e.g. 200" style={inner} />
            </Field>
            <Field label="Department">
              <Input value={department} onChangeText={setDepartment} style={inner} />
            </Field>
            <Field label="Programme">
              <Input value={programme} onChangeText={setProgramme} style={inner} />
            </Field>
            <Field label="Session">
              <Input
                value={session}
                onChangeText={setSession}
                placeholder="e.g. 2026/2027"
                style={inner}
              />
            </Field>
            <Field label="Semester">
              <Input
                value={semester}
                onChangeText={setSemester}
                placeholder="e.g. First"
                style={inner}
              />
            </Field>
            <Field label="Target CGPA">
              <Input
                value={targetCgpa}
                onChangeText={setTargetCgpa}
                keyboardType="decimal-pad"
                placeholder="e.g. 4.50"
                style={inner}
              />
            </Field>
            {statusLine("academic")}
            <Button
              title="Save academic"
              onPress={saveAcademic}
              loading={saving === "academic"}
            />
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <AppText size={17} weight="700">
              Housing preferences
            </AppText>
            <Field label="Housing status">
              <View style={styles.chips}>
                {HOUSING_STATUS.map((o) => (
                  <Chip
                    key={o.value}
                    label={o.label}
                    active={housingStatus === o.value}
                    onPress={() =>
                      setHousingStatus(housingStatus === o.value ? "" : o.value)
                    }
                  />
                ))}
              </View>
            </Field>
            <Field label="Max budget (₦)">
              <Input
                value={maxBudget}
                onChangeText={setMaxBudget}
                keyboardType="number-pad"
                placeholder="e.g. 250000"
                style={inner}
              />
            </Field>
            <Field label="Budget period">
              <View style={styles.chips}>
                {["year", "semester", "month"].map((p) => (
                  <Chip
                    key={p}
                    label={`Per ${p}`}
                    active={budgetPeriod === p}
                    onPress={() => setBudgetPeriod(p)}
                  />
                ))}
              </View>
            </Field>
            <Checkbox checked={alerts} onChange={setAlerts}>
              <AppText size={14}>Housing alerts</AppText>
            </Checkbox>
            {statusLine("housing")}
            <Button
              title="Save housing prefs"
              onPress={saveHousing}
              loading={saving === "housing"}
            />
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <AppText size={17} weight="700">
              Change password
            </AppText>
            <Field label="New password">
              <Input
                secureTextEntry
                autoComplete="new-password"
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="At least 6 characters"
                style={inner}
              />
            </Field>
            <Field label="Confirm password">
              <Input
                secureTextEntry
                autoComplete="new-password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                style={inner}
              />
            </Field>
            {statusLine("password")}
            <Button
              title="Update password"
              onPress={changePassword}
              loading={saving === "password"}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { gap: 16, padding: 20, paddingBottom: 40 },
  card: {
    borderRadius: radii.xl,
    padding: 20,
    gap: 14,
  },
  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
