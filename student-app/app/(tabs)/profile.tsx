import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  AppText,
  Avatar,
  Screen,
  TAB_BAR_CLEARANCE,
} from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { getStudentCampus, type StudentCampus } from "@/src/lib/campus";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type ProfileBits = {
  displayName: string;
  level: string;
  programme: string;
  department: string;
  avatarUrl: string | null;
  verification: string;
};

type MenuRow = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: Href;
};

const MENU: MenuRow[] = [
  { title: "Edit Profile", icon: "person-outline", href: "/profile-edit" },
  { title: "Verify student ID", icon: "shield-checkmark-outline", href: "/verify" },
  { title: "Notifications", icon: "notifications-outline", href: "/notifications" },
  { title: "AI tutor", icon: "sparkles-outline", href: "/inbox/ai-profile" },
  { title: "Settings", icon: "settings-outline", href: "/settings" },
  { title: "Help & support", icon: "headset-outline", href: "/support" },
];

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const colors = useTheme();
  const [campus, setCampus] = useState<StudentCampus | null>(null);
  const [bits, setBits] = useState<ProfileBits>({
    displayName: "Student",
    level: "",
    programme: "",
    department: "",
    avatarUrl: null,
    verification: "",
  });
  const [premiumDismissed, setPremiumDismissed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      async function load() {
        const [profileRes, studentRes, campusRow, enrollRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("first_name, last_name, preferred_name, full_name, avatar_url")
            .eq("id", user!.id)
            .maybeSingle(),
          supabase
            .from("student_profiles")
            .select(
              "academic_level, department_name, programme_name, verification_level",
            )
            .eq("user_id", user!.id)
            .maybeSingle(),
          getStudentCampus(supabase, user!.id),
          supabase
            .from("student_enrollments")
            .select("verification_status")
            .eq("user_id", user!.id)
            .eq("is_primary", true)
            .maybeSingle(),
        ]);
        if (cancelled) return;
        const p = profileRes.data;
        const s = studentRes.data;
        const preferred = p?.preferred_name?.trim();
        const first = p?.first_name?.trim() || "";
        const last = p?.last_name?.trim() || "";
        const full =
          preferred ||
          [first, last].filter(Boolean).join(" ") ||
          p?.full_name?.trim() ||
          "Student";
        const verified =
          enrollRes.data?.verification_status === "verified" ||
          s?.verification_level === "verified";
        setBits({
          displayName: full,
          level: String(s?.academic_level ?? ""),
          programme: String(s?.programme_name ?? ""),
          department: String(s?.department_name ?? ""),
          avatarUrl: p?.avatar_url
            ? `${p.avatar_url}${p.avatar_url.includes("?") ? "&" : "?"}t=${Date.now()}`
            : null,
          verification: verified
            ? "verified"
            : String(s?.verification_level || "unverified"),
        });
        setCampus(campusRow);
      }
      void load();
      return () => {
        cancelled = true;
      };
    }, [user]),
  );

  async function onSignOut() {
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
    router.replace("/(auth)/login");
  }

  const subtitle = [
    bits.level ? `Level ${bits.level}` : null,
    bits.programme || bits.department || null,
    campus ? campus.campusName : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Screen padded={false} tabClearance>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: TAB_BAR_CLEARANCE,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => router.replace("/(tabs)")}
            style={[styles.backBtn, { backgroundColor: colors.surface }]}
            accessibilityLabel="Back to home"
          >
            <Ionicons name="chevron-back" size={20} color={colors.fg} />
          </Pressable>
          <AppText size={18} weight="700">
            Profile
          </AppText>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.identity}>
          <Pressable
            onPress={() => router.push("/profile-edit")}
            accessibilityLabel="Edit profile photo"
          >
            <Avatar label={bits.displayName} size={96} uri={bits.avatarUrl} />
            <View
              style={[
                styles.cameraBadge,
                { backgroundColor: colors.inverseBg },
              ]}
            >
              <Ionicons name="camera" size={14} color={colors.inverseFg} />
            </View>
          </Pressable>
          <AppText size={22} weight="700" style={{ marginTop: 14 }}>
            {bits.displayName}
          </AppText>
          {user?.email ? (
            <AppText muted size={13} style={{ marginTop: 4 }}>
              {user.email}
            </AppText>
          ) : null}
          {subtitle ? (
            <AppText muted size={13} style={{ marginTop: 2 }}>
              {subtitle}
            </AppText>
          ) : null}
          {bits.verification ? (
            <View
              style={[
                styles.verifyPill,
                { backgroundColor: colors.accentSoft },
              ]}
            >
              <Ionicons name="shield-checkmark" size={12} color={colors.fg} />
              <AppText size={11} weight="600">
                {bits.verification.replaceAll("_", " ")}
              </AppText>
            </View>
          ) : null}
        </View>

        {!premiumDismissed ? (
          <View style={[styles.premium, { backgroundColor: colors.heroBg }]}>
            <Pressable
              onPress={() => setPremiumDismissed(true)}
              style={styles.premiumClose}
              hitSlop={10}
            >
              <Ionicons name="close" size={16} color={colors.heroMuted} />
            </Pressable>
            <View style={styles.premiumRow}>
              <View
                style={[
                  styles.premiumIcon,
                  { backgroundColor: "rgba(255,255,255,0.14)" },
                ]}
              >
                <Ionicons name="diamond" size={18} color={colors.accent} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText weight="700" size={15} style={{ color: colors.heroFg }}>
                  Go Premium
                </AppText>
                <AppText size={12} style={{ color: colors.heroMuted }}>
                  Unlock deeper AI study help and priority housing alerts.
                </AppText>
              </View>
            </View>
          </View>
        ) : null}

        <AppText size={16} weight="700" style={{ marginTop: 8, marginBottom: 10 }}>
          My Profile
        </AppText>

        <View style={{ gap: 10 }}>
          {MENU.map((row) => (
            <Pressable
              key={row.title}
              onPress={() => router.push(row.href)}
              style={({ pressed }) => [
                styles.menuCard,
                {
                  backgroundColor: colors.surface,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.menuIcon,
                  { backgroundColor: colors.accentSoft },
                ]}
              >
                <Ionicons name={row.icon} size={18} color={colors.fg} />
              </View>
              <AppText weight="600" size={15} style={{ flex: 1 }}>
                {row.title}
              </AppText>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={onSignOut}
          disabled={signingOut}
          style={[
            styles.signOut,
            {
              borderColor: colors.border,
              opacity: signingOut ? 0.6 : 1,
            },
          ]}
        >
          <AppText size={14} weight="600" style={{ color: colors.danger }}>
            {signingOut ? "Signing out…" : "Sign out"}
          </AppText>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
    marginBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  identity: {
    alignItems: "center",
    paddingVertical: 12,
  },
  cameraBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  verifyPill: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  premium: {
    borderRadius: radii.lg,
    padding: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  premiumClose: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 1,
  },
  premiumRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingRight: 18,
  },
  premiumIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  menuCard: {
    borderRadius: radii.md,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  signOut: {
    marginTop: 18,
    height: 48,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
});
