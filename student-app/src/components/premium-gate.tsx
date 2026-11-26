import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { View } from "react-native";
import { StudyShell } from "@/src/components/study";
import { AppText, Button } from "@/src/components/ui";
import { PREMIUM_GREEN } from "@/src/components/premium-badge";
import { formatNaira } from "@/src/lib/campus";
import { useTheme } from "@/src/theme/ThemeProvider";

/** Full-screen "this needs Premium" card used for the exam-prep features that come with Premium. */
export function PremiumGate({
  title,
  subtitle,
  feature,
  points,
  price,
}: {
  title: string;
  subtitle: string;
  feature: string;
  points: string[];
  price: number;
}) {
  const colors = useTheme();
  return (
    <StudyShell title={title} subtitle={subtitle}>
      <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 22, gap: 14 }}>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: PREMIUM_GREEN,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="lock-closed" size={22} color="#fff" />
        </View>
        <AppText size={20} weight="700">
          {feature} comes with Premium
        </AppText>
        <View style={{ gap: 8 }}>
          {points.map((p) => (
            <View key={p} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
              <Ionicons name="checkmark-circle" size={18} color={PREMIUM_GREEN} />
              <AppText size={14} style={{ flex: 1 }}>
                {p}
              </AppText>
            </View>
          ))}
        </View>
        <AppText muted size={13}>
          {formatNaira(price)} a month. Everything else in CampusOS stays free for you. Cancel renewal any time.
        </AppText>
        <Button title={`Get Premium · ${formatNaira(price)}/month`} onPress={() => router.push("/premium")} />
      </View>
    </StudyShell>
  );
}
