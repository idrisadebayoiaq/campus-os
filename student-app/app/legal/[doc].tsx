import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui";
import { PRIVACY, TERMS } from "@/src/lib/legal";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const content = doc === "privacy" ? PRIVACY : TERMS;
  const other = doc === "privacy" ? "terms" : "privacy";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.top}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          style={[styles.back, { backgroundColor: colors.surface }]}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={20} color={colors.fg} />
        </Pressable>
        <AppText size={17} weight="700">
          {content.title}
        </AppText>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: colors.heroBg }]}>
          <Ionicons
            name={doc === "privacy" ? "shield-checkmark" : "document-text"}
            size={26}
            color={colors.accent}
          />
          <AppText size={24} weight="700" style={{ color: colors.heroFg }}>
            {content.title}
          </AppText>
          <AppText size={13} style={{ color: colors.heroMuted }}>
            Last updated {content.updated}
          </AppText>
        </View>

        <AppText size={15} style={{ lineHeight: 23 }}>
          {content.intro}
        </AppText>

        {content.sections.map((s) => (
          <View key={s.title} style={[styles.section, { backgroundColor: colors.surface }]}>
            <AppText size={16} weight="700">
              {s.title}
            </AppText>
            {s.body.map((p) => (
              <View key={p} style={styles.para}>
                <View style={[styles.bullet, { backgroundColor: colors.accent }]} />
                <AppText size={14} muted style={{ flex: 1, lineHeight: 21 }}>
                  {p}
                </AppText>
              </View>
            ))}
          </View>
        ))}

        <Pressable
          onPress={() => router.replace({ pathname: "/legal/[doc]", params: { doc: other } })}
          style={[styles.link, { borderColor: colors.border }]}
        >
          <AppText size={14} weight="600">
            Read the {other === "privacy" ? "Privacy Policy" : "Terms of Service"}
          </AppText>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </Pressable>
      </ScrollView>
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
  content: { paddingHorizontal: 20, gap: 14 },
  hero: { borderRadius: radii.lg, padding: 22, gap: 8 },
  section: { borderRadius: radii.md, padding: 18, gap: 10 },
  para: { flexDirection: "row", gap: 10 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  link: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: radii.md,
    padding: 16,
  },
});
