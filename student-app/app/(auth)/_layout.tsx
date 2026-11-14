import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/src/lib/auth";
import { useTheme } from "@/src/theme/ThemeProvider";

export default function AuthLayout() {
  const { session, loading } = useAuth();
  const colors = useTheme();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator color={colors.fg} />
      </View>
    );
  }

  if (session) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
    </Stack>
  );
}
