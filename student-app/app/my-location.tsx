import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LocationPicker } from "@/src/components/location-picker";
import { AppText, Button } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { loadSavedLocation, saveLocation, type SavedLocation } from "@/src/lib/location";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

export default function MyLocationScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [saved, setSaved] = useState<SavedLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    void loadSavedLocation(supabase, user.id).then((loc) => {
      setSaved(loc);
      setLoading(false);
    });
  }, [user]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.top}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.back, { backgroundColor: colors.surface }]}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={20} color={colors.fg} />
        </Pressable>
        <AppText size={17} weight="700">
          My location
        </AppText>
      </View>

      <View style={styles.content}>
        <View style={[styles.hero, { backgroundColor: colors.heroBg }]}>
          <View style={[styles.heroIcon, { backgroundColor: colors.accent }]}>
            <Ionicons name="location" size={24} color={colors.onAccent} />
          </View>
          <AppText size={20} weight="700" style={{ color: colors.heroFg }}>
            Where you stay
          </AppText>
          <AppText size={14} style={{ color: colors.heroMuted, lineHeight: 20 }}>
            Schools, housing and places are ranked around this spot. Only the
            address you confirm is saved.
          </AppText>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          {loading ? (
            <ActivityIndicator color={colors.fg} />
          ) : saved ? (
            <View style={styles.row}>
              <Ionicons name="home-outline" size={22} color={colors.fg} />
              <View style={{ flex: 1 }}>
                <AppText size={13} muted>
                  Current location
                </AppText>
                <AppText size={15} weight="600">
                  {saved.label}
                </AppText>
              </View>
            </View>
          ) : (
            <AppText muted size={14}>
              You haven&apos;t set a location yet.
            </AppText>
          )}
        </View>

        {status ? (
          <AppText size={14} style={{ color: status.ok ? colors.success : colors.danger }}>
            {status.text}
          </AppText>
        ) : null}
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Button
          title={saved ? "Change location" : "Choose on map"}
          onPress={() => setPicking(true)}
        />
      </View>

      <LocationPicker
        visible={picking}
        title="Your location"
        confirmLabel="Save location"
        initial={saved}
        onClose={() => setPicking(false)}
        onConfirm={async (place) => {
          setPicking(false);
          if (!user) return;
          const { error } = await saveLocation(supabase, user.id, place);
          if (error) {
            setStatus({ ok: false, text: error.message });
            return;
          }
          setSaved(place);
          setStatus({ ok: true, text: "Location saved." });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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
  content: { flex: 1, paddingHorizontal: 20, gap: 14, paddingTop: 6 },
  hero: { borderRadius: radii.lg, padding: 22, gap: 8 },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  card: { borderRadius: radii.md, padding: 18, minHeight: 70, justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  footer: { paddingHorizontal: 20, paddingTop: 10 },
});
