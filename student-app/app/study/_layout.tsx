import { Stack } from "expo-router";
import { useTheme } from "@/src/theme/ThemeProvider";

export default function StudyLayout() {
  const colors = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: "slide_from_right",
      }}
    />
  );
}
