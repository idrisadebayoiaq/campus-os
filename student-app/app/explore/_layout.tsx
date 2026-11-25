import { Stack } from "expo-router";
import { useTheme } from "@/src/theme/ThemeProvider";

export default function ExploreLayout() {
  const colors = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.fg,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="food" options={{ headerShown: false }} />
      <Stack.Screen name="marketplace/index" options={{ headerShown: false }} />
      <Stack.Screen name="marketplace/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="business/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="guides" options={{ title: "Guides" }} />
    </Stack>
  );
}
