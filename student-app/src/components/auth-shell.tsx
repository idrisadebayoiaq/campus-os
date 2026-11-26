import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeProvider";

const LOGO = require("@/assets/icon.png");

/** Branded header + rounded sheet used by login and signup. */
export function AuthShell({
  title,
  subtitle,
  step,
  children,
}: {
  title: string;
  subtitle: string;
  step?: { current: number; total: number; label: string };
  children: ReactNode;
}) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.heroBg }}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={[styles.hero, { paddingTop: insets.top + 20 }]}>
            <View style={[styles.blob, styles.blobA, { backgroundColor: colors.accent }]} />
            <View style={[styles.blob, styles.blobB, { backgroundColor: colors.accent }]} />

            <View style={styles.brand}>
              <Image source={LOGO} style={styles.logo} />
              <Text style={[styles.wordmark, { color: colors.heroFg }]}>CampusOS</Text>
            </View>

            {step ? (
              <View style={styles.stepRow}>
                {Array.from({ length: step.total }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.stepPill,
                      {
                        backgroundColor:
                          i < step.current ? colors.accent : "rgba(255,255,255,0.22)",
                        flex: i === step.current - 1 ? 2 : 1,
                      },
                    ]}
                  />
                ))}
              </View>
            ) : null}
            {step ? (
              <AppText size={12} weight="600" style={{ color: colors.heroMuted }}>
                STEP {step.current} OF {step.total} · {step.label.toUpperCase()}
              </AppText>
            ) : null}

            <AppText size={30} weight="700" style={{ color: colors.heroFg, lineHeight: 36 }}>
              {title}
            </AppText>
            <AppText size={15} style={{ color: colors.heroMuted, lineHeight: 21 }}>
              {subtitle}
            </AppText>
          </View>

          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.bg,
                paddingBottom: Math.max(insets.bottom, 16) + 20,
              },
            ]}
          >
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: 24,
    paddingBottom: 48,
    gap: 10,
    overflow: "hidden",
  },
  blob: { position: "absolute", borderRadius: 999, opacity: 0.18 },
  blobA: { width: 260, height: 260, right: -90, top: -70 },
  blobB: { width: 140, height: 140, right: 60, top: 150, opacity: 0.1 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 18 },
  logo: { width: 42, height: 42, borderRadius: 12 },
  wordmark: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  stepRow: { flexDirection: "row", gap: 6, marginBottom: 2 },
  stepPill: { height: 5, borderRadius: 3 },
  sheet: {
    flex: 1,
    marginTop: -26,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 22,
    paddingTop: 28,
    gap: 18,
  },
});
