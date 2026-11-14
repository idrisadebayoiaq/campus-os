import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppText, Button, Card, Screen } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { getStudentCampus, type StudentCampus } from "@/src/lib/campus";
import { supabase } from "@/src/lib/supabase";

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [name, setName] = useState("");
  const [campus, setCampus] = useState<StudentCampus | null>(null);
  const [loading, setLoading] = useState(false);

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
          "",
      );
      setCampus(campusRow);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function onSignOut() {
    setLoading(true);
    await signOut();
    setLoading(false);
    router.replace("/(auth)/login");
  }

  return (
    <Screen>
      <View style={styles.content}>
        <AppText size={22} weight="700">
          Profile
        </AppText>
        <Card style={{ gap: 8 }}>
          <AppText weight="600">{name || "Student"}</AppText>
          <AppText muted size={14}>
            {user?.email}
          </AppText>
          <AppText muted size={14}>
            {campus
              ? `${campus.institutionName} · ${campus.campusName}`
              : "No campus selected yet"}
          </AppText>
        </Card>
        <AppText muted size={13}>
          Full preferences and onboarding stay on the CampusOS website for now.
        </AppText>
        <Button
          title={loading ? "Signing out…" : "Sign out"}
          variant="secondary"
          onPress={onSignOut}
          loading={loading}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingVertical: 16 },
});
