import { Redirect, Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { FloatingTabBar } from "@/src/components/floating-tab-bar";
import { useAuth } from "@/src/lib/auth";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";

export default function TabsLayout() {
  const { session, user, loading } = useAuth();
  const colors = useTheme();
  const [needsCampus, setNeedsCampus] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setNeedsCampus(null);
      return;
    }
    let cancelled = false;
    async function check() {
      try {
        const { data, error } = await supabase
          .from("campus_memberships")
          .select("id")
          .eq("user_id", user!.id)
          .limit(1);
        if (cancelled) return;
        setNeedsCampus(!error && (data?.length ?? 0) === 0);
      } catch {
        if (!cancelled) setNeedsCampus(false);
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading || (session && needsCampus === null)) {
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

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  if (needsCampus) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: { position: "absolute" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="housing" options={{ title: "Housing" }} />
      <Tabs.Screen name="marketplace" options={{ title: "Market" }} />
      <Tabs.Screen name="ai" options={{ title: "AI Study" }} />
      {/* Keep study/inbox/profile as real tabs (no href:null). Expo Router 58
          redirects hidden tabs back to Home when focused. FloatingTabBar still
          only highlights the four primary icons. */}
      <Tabs.Screen name="study" options={{ title: "Study" }} />
      <Tabs.Screen name="inbox" options={{ title: "Chat" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
