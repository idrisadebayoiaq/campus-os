import { Link, Stack } from "expo-router";
import { StyleSheet, View } from "react-native";
import { AppText, Screen } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeProvider";

export default function NotFoundScreen() {
  const colors = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <Screen>
        <View style={styles.content}>
          <AppText size={22} weight="700">
            Screen not found
          </AppText>
          <AppText muted>
            This route is not in the CampusOS student app yet.
          </AppText>
          <Link
            href="/"
            style={{ color: colors.fg, fontWeight: "600", marginTop: 12 }}
          >
            Go home
          </Link>
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: 8, paddingVertical: 24 },
});
