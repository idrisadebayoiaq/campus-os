import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, Chip } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";
import { notify } from "@/src/lib/feedback";

const REASONS = ["Scam or fraud", "Not as described", "Rude or unsafe", "Wrong price", "Fake photos", "Other"];

export default function ReportScreen() {
  const { type, id, title } = useLocalSearchParams<{ type: string; id: string; title?: string }>();
  const { user } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [busy, setBusy] = useState(false);

  async function pick() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 4 - photos.length,
      quality: 0.6,
    });
    if (!res.canceled) setPhotos((p) => [...p, ...res.assets].slice(0, 4));
  }

  async function submit() {
    if (!user || !reason || !id || !type) return;
    const text = [reason, details.trim()].filter(Boolean).join(": ");
    setBusy(true);
    const urls: string[] = [];
    for (const [i, a] of photos.entries()) {
      try {
        const ext = a.mimeType?.includes("png") ? "png" : "jpg";
        const path = `${user.id}/reports/${Date.now()}-${i}.${ext}`;
        const buf = await (await fetch(a.uri)).arrayBuffer();
        const { error } = await supabase.storage.from("chat-media").upload(path, buf, { contentType: a.mimeType ?? `image/${ext === "jpg" ? "jpeg" : ext}` });
        if (!error) urls.push(supabase.storage.from("chat-media").getPublicUrl(path).data.publicUrl);
      } catch {
        // A failed photo shouldn't stop the report.
      }
    }
    const { error } = await supabase.from("reports").insert({
      reporter_id: user.id,
      entity_type: type,
      entity_id: id,
      reason: text,
      evidence_urls: urls,
    });
    setBusy(false);
    if (error) {
      notify("Couldn't send report", error.message);
      return;
    }
    notify("Report sent", "Thanks. Our team will look into it. Your identity stays private.", [{ text: "OK", onPress: () => router.back() }]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.surface }]} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={20} color={colors.fg} />
        </Pressable>
        <AppText size={18} weight="700">
          Report
        </AppText>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 100 }} keyboardShouldPersistTaps="handled">
        {title ? (
          <AppText muted>
            About: <AppText weight="700">{title}</AppText>
          </AppText>
        ) : null}
        <View style={{ gap: 8 }}>
          <AppText weight="700">What went wrong?</AppText>
          <View style={styles.wrap}>
            {REASONS.map((r) => (
              <Chip key={r} label={r} active={reason === r} onPress={() => setReason(r)} />
            ))}
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <AppText weight="700">Tell us more</AppText>
          <TextInput
            value={details}
            onChangeText={setDetails}
            multiline
            maxLength={800}
            placeholder="What happened? Include dates, amounts, anything that helps."
            placeholderTextColor={colors.muted}
            style={[styles.area, { color: colors.fg, borderColor: colors.border, backgroundColor: colors.surface }]}
          />
        </View>
        <View style={{ gap: 8 }}>
          <AppText weight="700">Photos (optional)</AppText>
          <View style={styles.wrap}>
            {photos.map((p, i) => (
              <Pressable key={p.uri} onPress={() => setPhotos((x) => x.filter((_, j) => j !== i))}>
                <Image source={{ uri: p.uri }} style={styles.thumb} resizeMode="cover" />
                <View style={styles.x}>
                  <Ionicons name="close" size={12} color="#fff" />
                </View>
              </Pressable>
            ))}
            {photos.length < 4 ? (
              <Pressable onPress={() => void pick()} style={[styles.thumb, styles.add, { borderColor: colors.border }]}>
                <Ionicons name="camera-outline" size={22} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
        </View>
        <AppText size={12} muted>
          Reports are private. The business may be asked to respond, but never sees who reported.
        </AppText>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14), backgroundColor: colors.bg, borderTopColor: colors.border }]}>
        <Pressable
          onPress={() => void submit()}
          disabled={busy || !reason}
          style={[styles.cta, { backgroundColor: colors.inverseBg, opacity: busy || !reason ? 0.5 : 1 }]}
        >
          <AppText weight="700" style={{ color: colors.inverseFg }}>
            {busy ? "Sending…" : "Send report"}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  area: { minHeight: 110, borderWidth: 1, borderRadius: radii.md, padding: 12, fontSize: 14, textAlignVertical: "top" },
  thumb: { width: 72, height: 72, borderRadius: radii.md },
  add: { borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  x: { position: "absolute", top: 4, right: 4, width: 18, height: 18, borderRadius: 9, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  cta: { height: 52, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
});
