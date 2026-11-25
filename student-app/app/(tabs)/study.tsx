import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { AppText, Screen, TAB_BAR_CLEARANCE } from "@/src/components/ui";
import { STUDY_TOOLS } from "@/src/lib/study";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

export default function StudyScreen() {
  const colors = useTheme();
  const router = useRouter();

  return (
    <Screen padded={false} tabClearance>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: TAB_BAR_CLEARANCE }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <AppText size={28} weight="700">
            Study Hub
          </AppText>
          <AppText muted size={14}>
            Courses, tools, and tutoring in one place
          </AppText>
        </View>

        <View style={[styles.hero, { backgroundColor: colors.heroBg }]}>
          <View style={styles.badge}>
            <Ionicons name="cloud-done-outline" size={14} color={colors.heroFg} />
            <AppText size={12} weight="600" style={{ color: colors.heroFg }}>
              Offline ready
            </AppText>
          </View>
          <AppText size={24} weight="700" style={{ color: colors.heroFg, marginTop: 12 }}>
            Study anywhere
          </AppText>
          <AppText size={14} style={{ color: colors.heroMuted, marginTop: 6 }}>
            Your courses, notes and grades are saved on this device. Anything
            you add offline syncs the next time you're online.
          </AppText>
        </View>

        <View style={styles.grid}>
          {STUDY_TOOLS.map((tool) => (
            <Pressable
              key={tool.href}
              onPress={() => router.push(`/study/${tool.href}` as Href)}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <View style={[styles.icon, { backgroundColor: colors.inverseBg }]}>
                <Ionicons name={tool.icon} size={18} color={colors.inverseFg} />
              </View>
              <AppText weight="700" size={15}>
                {tool.title}
              </AppText>
              <AppText muted size={13}>
                {tool.body}
              </AppText>
              <AppText muted size={11} weight="600" style={{ marginTop: "auto" }}>
                {tool.offline ? "Works offline" : "Needs internet"}
              </AppText>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18, paddingTop: 8 },
  header: { paddingHorizontal: 20, gap: 4 },
  hero: {
    marginHorizontal: 20,
    borderRadius: radii.xl,
    padding: 22,
  },
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  grid: {
    paddingHorizontal: 20,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  card: {
    width: "47%",
    flexGrow: 1,
    borderRadius: radii.lg,
    padding: 16,
    gap: 6,
    minHeight: 150,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
});
