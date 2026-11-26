import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

export const PREMIUM_GREEN = "#16a34a";

/** Green "Premium" badge with a check sign. Shown next to the name of every Premium account. */
export function PremiumBadge({ compact = false, style }: { compact?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.pill, style]} accessibilityLabel="CampusOS Premium">
      <Ionicons name="checkmark" size={compact ? 11 : 12} color="#ffffff" />
      {compact ? null : <Text style={styles.text}>Premium</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: PREMIUM_GREEN,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: "center",
  },
  text: { color: "#ffffff", fontSize: 10, fontWeight: "700" },
});
