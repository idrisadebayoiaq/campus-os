import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppText, Card, Screen } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { getStudentCampus, type StudentCampus } from "@/src/lib/campus";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";

const SHORTCUTS = [
  { href: "/(tabs)/housing", title: "Housing", body: "Rooms near campus" },
  { href: "/(tabs)/study", title: "Study", body: "Courses & tools" },
  { href: "/(tabs)/inbox", title: "Inbox", body: "Messages" },
  { href: "/(tabs)/profile", title: "Profile", body: "Settings" },
] as const;

export default function HomeScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const [name, setName] = useState("Student");
  const [campus, setCampus] = useState<StudentCampus | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user) return;
      const [{ data: profile }, campusRow] = await Promise.all([
        supabase
          .from("profiles")
          .select("preferred_name, first_name, full_name")
          .eq("id", user.id)
          .maybeSingle(),
        getStudentCampus(supabase, user.id),
      ]);
      if (cancelled) return;
      setName(
        profile?.preferred_name ||
          profile?.first_name ||
          profile?.full_name ||
          user.email?.split("@")[0] ||
          "Student",
      );
      setCampus(campusRow);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ gap: 4 }}>
          <AppText muted size={14}>
            Home
          </AppText>
          <AppText size={26} weight="700">
            Hi {name}
          </AppText>
          <AppText muted size={14}>
            {campus
              ? `${campus.institutionName} · ${campus.campusName}`
              : "Choose your campus on the CampusOS website to personalize housing."}
          </AppText>
        </View>

        <View style={styles.grid}>
          {SHORTCUTS.map((item) => (
            <Pressable
              key={item.href}
              onPress={() => router.push(item.href as never)}
              style={({ pressed }) => [
                { opacity: pressed ? 0.85 : 1, flex: 1, minWidth: "45%" },
              ]}
            >
              <Card style={{ gap: 4, backgroundColor: colors.surface }}>
                <AppText weight="600">{item.title}</AppText>
                <AppText muted size={13}>
                  {item.body}
                </AppText>
              </Card>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 24, paddingVertical: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
});
