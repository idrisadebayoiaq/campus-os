import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, Button } from "@/src/components/ui";
import { AI_AVATARS, DEFAULT_AI_AVATAR } from "@/src/lib/ai-avatars";
import { useAuth } from "@/src/lib/auth";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

export default function AiAvatarScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [current, setCurrent] = useState<string>(DEFAULT_AI_AVATAR.key);
  const [selected, setSelected] = useState<string>(DEFAULT_AI_AVATAR.key);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tile = Math.floor((Math.min(width, 520) - 20 * 2 - 14) / 2);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("ai_companion_profiles")
        .select("id, avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const key = (data?.avatar_url as string | null) || DEFAULT_AI_AVATAR.key;
      setProfileId((data?.id as string | undefined) ?? null);
      setCurrent(key);
      setSelected(key);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function save() {
    if (!profileId) {
      setError("Open your AI chat once, then pick an avatar.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: updErr } = await supabase
      .from("ai_companion_profiles")
      .update({ avatar_url: selected, updated_at: new Date().toISOString() })
      .eq("id", profileId);
    setSaving(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    router.back();
  }

  const chosen = AI_AVATARS.find((a) => a.key === selected) ?? DEFAULT_AI_AVATAR;

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
          Choose avatar
        </AppText>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.fg} />
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 140, gap: 20 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.preview}>
              <Image
                source={chosen.source}
                style={{ width: 112, height: 112, borderRadius: 56 }}
              />
              <AppText size={20} weight="700" style={{ marginTop: 12 }}>
                {chosen.name}
              </AppText>
              <AppText muted size={13} style={{ textAlign: "center", marginTop: 4 }}>
                Pick one of the CampusOS tutor avatars. Personal photos can’t be
                used for your AI.
              </AppText>
            </View>

            <View style={styles.grid}>
              {AI_AVATARS.map((avatar) => {
                const on = avatar.key === selected;
                return (
                  <Pressable
                    key={avatar.key}
                    onPress={() => setSelected(avatar.key)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={avatar.name}
                    style={({ pressed }) => [
                      styles.tile,
                      {
                        width: tile,
                        backgroundColor: colors.surface,
                        borderColor: on ? colors.accent : "transparent",
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <Image
                      source={avatar.source}
                      style={{
                        width: tile - 48,
                        height: tile - 48,
                        borderRadius: (tile - 48) / 2,
                      }}
                    />
                    <AppText size={14} weight="600" style={{ marginTop: 10 }}>
                      {avatar.name}
                    </AppText>
                    {on ? (
                      <View style={[styles.check, { backgroundColor: colors.accent }]}>
                        <Ionicons name="checkmark" size={14} color={colors.onAccent} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View
            style={[
              styles.footer,
              {
                backgroundColor: colors.bg,
                borderTopColor: colors.border,
                paddingBottom: Math.max(insets.bottom, 12) + 4,
              },
            ]}
          >
            {error ? (
              <AppText size={13} style={{ color: colors.danger, marginBottom: 8 }}>
                {error}
              </AppText>
            ) : null}
            <Button
              title={selected === current ? "Current avatar" : "Use this avatar"}
              onPress={save}
              loading={saving}
              disabled={selected === current}
            />
          </View>
        </>
      )}
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  preview: { alignItems: "center", paddingHorizontal: 12 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 14,
  },
  tile: {
    borderRadius: radii.md,
    borderWidth: 2,
    paddingVertical: 18,
    alignItems: "center",
  },
  check: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
