import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { AuthProvider } from "@/src/lib/auth";
import { ThemeProvider, useTheme } from "@/src/theme/ThemeProvider";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const colors = useTheme();
  const scheme = useColorScheme();

  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.fg,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="housing/[id]"
          options={{ title: "Listing", headerBackTitle: "Back" }}
        />
      </Stack>
    </>
  );
}
