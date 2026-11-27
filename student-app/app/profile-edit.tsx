import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ChipRow, Group, ListRow, PageShell, Section, Segmented } from "@/src/components/page";
import { AppText, Avatar, Button, Field, Input, PasswordInput } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { actionSheet, notify } from "@/src/lib/feedback";
import { useStudentKind } from "@/src/lib/student-kind";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

const LEVELS = ["100", "200", "300", "400", "500", "600"].map((v) => ({ value: v, label: `${v}L` }));

function sessions() {
  const y = new Date().getFullYear();
  return [y - 2, y - 1, y, y + 1].map((s) => ({ value: `${s}/${s + 1}`, label: `${s}/${s + 1}` }));
}

function numOrNull(v: string) {
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function ProfileEditScreen() {
  const { user, signOut } = useAuth();
  const { isExamPrep } = useStudentKind();
  const colors = useTheme();

  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [level, setLevel] = useState("");
  const [department, setDepartment] = useState("");
  const [programme, setProgramme] = useState("");
  const [session, setSession] = useState("");
  const [semester, setSemester] = useState<"First" | "Second">("First");
  const [targetCgpa, setTargetCgpa] = useState("");
  const [blockers, setBlockers] = useState<string[]>([]);
  const [closing, setClosing] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"save" | "photo" | "delete" | null>(null);
  const sessionOptions = useMemo(sessions, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const [profileRes, studentRes, b] = await Promise.all([
        supabase
          .from("profiles")
          .select("first_name, last_name, preferred_name, full_name, avatar_url, phone")
          .eq("id", user.id)
          .maybeSingle(),
        supabase.from("student_profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.rpc("my_account_blockers"),
      ]);
      if (cancelled) return;
      const p = profileRes.data;
      const s = studentRes.data as Record<string, unknown> | null;
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
      setPhone(p?.phone || "");
      setAvatarUrl(p?.avatar_url || null);
      setBlockers((b.data as string[] | null) ?? []);
      setLevel(String(s?.academic_level ?? "").replace(/l$/i, ""));
      setDepartment(String(s?.department_name ?? ""));
      setProgramme(String(s?.programme_name ?? ""));
      setSession(String(s?.academic_session ?? ""));
      setSemester(/second|2/i.test(String(s?.current_semester ?? "")) ? "Second" : "First");
      setTargetCgpa(s?.target_cgpa ? String(s.target_cgpa) : "");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const displayName = preferredName.trim() || `${firstName} ${lastName}`.trim() || "Student";

  async function uploadAvatar(asset: ImagePicker.ImagePickerAsset) {
    if (!user) return;
    setBusy("photo");
    try {
      const ext = asset.mimeType?.includes("png") ? "png" : asset.mimeType?.includes("webp") ? "webp" : "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const buffer = await (await fetch(asset.uri)).arrayBuffer();
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, buffer, { contentType: asset.mimeType || `image/${ext === "jpg" ? "jpeg" : ext}`, upsert: true });
      if (uploadError) throw uploadError;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error } = await supabase.from("profiles").update({ avatar_url: pub.publicUrl }).eq("id", user.id);
      if (error) throw error;
      setAvatarUrl(`${pub.publicUrl}?t=${Date.now()}`);
      notify("Photo updated", undefined, undefined, { tone: "success" });
    } catch (e) {
      notify("Couldn't upload photo", e instanceof Error ? e.message : undefined, undefined, { tone: "danger" });
    } finally {
      setBusy(null);
    }
  }

  async function pick(fromCamera: boolean) {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notify(fromCamera ? "Camera access needed" : "Photo access needed", undefined, undefined, { tone: "warn" });
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.85 };
    const result = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!result.canceled && result.assets[0]) await uploadAvatar(result.assets[0]);
  }

  function photoMenu() {
    actionSheet("Profile photo", [
      { text: "Choose from gallery", onPress: () => void pick(false) },
      { text: "Take a photo", onPress: () => void pick(true) },
      ...(avatarUrl
        ? [
            {
              text: "Remove photo",
              style: "destructive" as const,
              onPress: async () => {
                if (!user) return;
                const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
                if (error) notify("Couldn't remove photo", error.message, undefined, { tone: "danger" });
                else setAvatarUrl(null);
              },
            },
          ]
        : []),
    ]);
  }

  async function save() {
    if (!user) return;
    if (!firstName.trim()) {
      notify("Add your first name", undefined, undefined, { tone: "warn" });
      return;
    }
    setBusy("save");
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const { error: pErr } = await supabase
      .from("profiles")
      .update({
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        preferred_name: preferredName.trim() || null,
        phone: phone.trim() || null,
        full_name: fullName || null,
      })
      .eq("id", user.id);
    let sErr = null;
    if (!isExamPrep) {
      ({ error: sErr } = await supabase.from("student_profiles").upsert(
        {
          user_id: user.id,
          academic_level: level || null,
          department_name: department.trim() || null,
          programme_name: programme.trim() || null,
          academic_session: session || null,
          current_semester: semester,
          target_cgpa: numOrNull(targetCgpa),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      ));
    }
    setBusy(null);
    const err = pErr ?? sErr;
    if (err) notify("Couldn't save", err.message, undefined, { tone: "danger" });
    else notify("Profile saved", undefined, undefined, { tone: "success" });
  }

  async function deleteAccount() {
    if (!user?.email) return;
    if (confirmText.trim() !== "DELETE") {
      notify("Type DELETE to confirm", undefined, undefined, { tone: "warn" });
      return;
    }
    setBusy("delete");
    const auth = await supabase.auth.signInWithPassword({ email: user.email, password });
    if (auth.error) {
      setBusy(null);
      notify("Wrong password", undefined, undefined, { tone: "danger" });
      return;
    }
    const { error } = await supabase.rpc("delete_my_account", { p_confirm: "DELETE" });
    if (error) {
      setBusy(null);
      notify("Couldn't delete account", error.message, undefined, { tone: "danger" });
      return;
    }
    await signOut();
    router.replace("/(auth)/login");
  }

  return (
    <PageShell
      title="Edit profile"
      loading={loading}
      footer={<Button title="Save changes" onPress={() => void save()} loading={busy === "save"} />}
    >
      <View style={styles.photo}>
        <Pressable onPress={photoMenu} disabled={busy === "photo"} accessibilityLabel="Change photo">
          <Avatar label={displayName} size={104} uri={avatarUrl} />
          <View style={[styles.camera, { backgroundColor: colors.inverseBg, borderColor: colors.bg }]}>
            <Ionicons name="camera" size={16} color={colors.inverseFg} />
          </View>
        </Pressable>
        <Pressable onPress={photoMenu} hitSlop={8}>
          <AppText weight="700" style={{ color: colors.accent }}>
            {busy === "photo" ? "Uploading…" : "Change photo"}
          </AppText>
        </Pressable>
      </View>

      <Section title="Personal">
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Field label="First name">
                <Input value={firstName} onChangeText={setFirstName} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Last name">
                <Input value={lastName} onChangeText={setLastName} />
              </Field>
            </View>
          </View>
          <Field label="Preferred name">
            <Input value={preferredName} onChangeText={setPreferredName} placeholder="Optional" />
          </Field>
          <Field label="Phone" hint="Never shown publicly.">
            <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="0801 234 5678" />
          </Field>
          <Field label="Email">
            <Input value={user?.email ?? ""} editable={false} />
          </Field>
        </View>
      </Section>

      {!isExamPrep ? (
        <Section title="Studies">
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Field label="Level">
              <ChipRow options={LEVELS} value={level} onChange={setLevel} />
            </Field>
            <Field label="Programme">
              <Input value={programme} onChangeText={setProgramme} placeholder="e.g. Computer Science" />
            </Field>
            <Field label="Department">
              <Input value={department} onChangeText={setDepartment} />
            </Field>
            <Field label="Session">
              <ChipRow options={sessionOptions} value={session} onChange={setSession} />
            </Field>
            <Field label="Semester">
              <Segmented
                options={[
                  { value: "First", label: "First" },
                  { value: "Second", label: "Second" },
                ]}
                value={semester}
                onChange={setSemester}
              />
            </Field>
            <Field label="Target CGPA">
              <Input value={targetCgpa} onChangeText={setTargetCgpa} keyboardType="decimal-pad" placeholder="e.g. 4.50" />
            </Field>
          </View>
        </Section>
      ) : null}

      <Section title="Security">
        <Group>
          <ListRow icon="key-outline" title="Change password" onPress={() => router.push("/change-password")} />
          <ListRow
            icon="trash-outline"
            title="Delete account"
            onPress={() => setClosing((v) => !v)}
            right={<Ionicons name={closing ? "chevron-up" : "chevron-down"} size={16} color={colors.muted} />}
            chevron={false}
          />
        </Group>
        {closing ? (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {blockers.length ? (
              <View style={{ gap: 6 }}>
                <AppText weight="700">Finish these first</AppText>
                {blockers.map((b) => (
                  <AppText key={b} size={13} muted>
                    • {b}
                  </AppText>
                ))}
              </View>
            ) : (
              <>
                <AppText muted size={13}>
                  Removes your name, photo and contact details. This can&apos;t be undone.
                </AppText>
                <Field label="Type DELETE">
                  <Input value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" />
                </Field>
                <Field label="Password">
                  <PasswordInput value={password} onChangeText={setPassword} />
                </Field>
                <Button title="Delete my account" variant="danger" onPress={() => void deleteAccount()} loading={busy === "delete"} />
              </>
            )}
          </View>
        ) : null}
      </Section>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  photo: { alignItems: "center", gap: 10, paddingVertical: 4 },
  camera: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  card: { borderRadius: radii.lg, padding: 16, gap: 14 },
  row2: { flexDirection: "row", gap: 10 },
});
