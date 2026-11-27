import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LocationPicker } from "@/src/components/location-picker";
import { PageShell } from "@/src/components/page";
import { AppText, Button } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { notify, toast } from "@/src/lib/feedback";
import { loadSavedLocation, saveLocation, type SavedLocation } from "@/src/lib/location";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

export default function MyLocationScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const [saved, setSaved] = useState<SavedLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!user) return;
    void loadSavedLocation(supabase, user.id).then((loc) => {
      setSaved(loc);
      setLoading(false);
    });
  }, [user]);

  return (
    <PageShell
      title="My location"
      loading={loading}
      footer={<Button title={saved ? "Change on map" : "Choose on map"} onPress={() => setPicking(true)} />}
    >
      <View style={[styles.card, { backgroundColor: colors.heroBg }]}>
        <View style={[styles.icon, { backgroundColor: colors.accent }]}>
          <Ionicons name="location" size={24} color={colors.onAccent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText size={12} weight="600" style={{ color: colors.heroMuted }}>
            WHERE YOU STAY
          </AppText>
          <AppText size={16} weight="700" style={{ color: colors.heroFg }} numberOfLines={3}>
            {saved?.label || "Not set"}
          </AppText>
        </View>
      </View>
      <AppText muted size={13} style={{ textAlign: "center" }}>
        Housing and places are sorted around this spot.
      </AppText>

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
            notify("Couldn't save", error.message, undefined, { tone: "danger" });
            return;
          }
          setSaved(place);
          toast.success("Location saved");
        }}
      />
    </PageShell>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 14, padding: 18, borderRadius: radii.xl },
  icon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
});
