import Constants from "expo-constants";
import { router, type Href } from "expo-router";
import { useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { useTenancy } from "@/src/lib/tenancy";
import {
  useTheme,
  useThemeControls,
  type ThemePreference,
} from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type SettingsRow = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  href?: Href;
  externalUrl?: string;
  status?: string;
  onPress?: () => void;
};

type SettingsGroup = {
  key: string;
  title?: string;
  rows: SettingsRow[];
};

const APP_VERSION = Constants.expoConfig?.version ?? "";
const DOWNLOAD_URL = "https://campusos-app.vercel.app/download";
export default function SettingsScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const { hasActiveHome } = useTenancy();
  const { preference, setPreference } = useThemeControls();
  const [signingOut, setSigningOut] = useState(false);

  const themeLabel =
    preference === "system"
      ? "System"
      : preference === "dark"
        ? "Dark"
        : "Light";

  function cycleTheme() {
    const order: ThemePreference[] = ["system", "light", "dark"];
    const next = order[(order.indexOf(preference) + 1) % order.length];
    setPreference(next);
  }

  const groups: SettingsGroup[] = [
    ...(hasActiveHome
      ? [
          {
            key: "home",
            title: "Home",
            rows: [
              {
                title: "Apartment",
                icon: "home-outline" as const,
                href: "/apartment" as Href,
                status: "Your house",
              },
            ],
          },
        ]
      : []),
    {
      key: "account",
      title: "Account",
      rows: [
        {
          title: "Edit profile",
          icon: "person-outline",
          href: "/profile-edit",
        },
        {
          title: "Login & password",
          icon: "key-outline",
          href: "/change-password",
        },
        {
          title: "Verify student ID",
          icon: "shield-checkmark-outline",
          href: "/verify",
        },
        {
          title: "Campus",
          icon: "school-outline",
          href: "/onboarding",
        },
      ],
    },
    {
      key: "preferences",
      title: "Preferences",
      rows: [
        {
          title: "My location",
          icon: "location-outline",
          href: "/my-location",
        },
        {
          title: "Housing preferences",
          icon: "home-outline",
          href: "/housing-preferences",
        },
        {
          title: "Study lock",
          icon: "lock-closed-outline",
          href: "/study-lock",
        },
        {
          title: "Study & alert preferences",
          icon: "options-outline",
          href: "/preferences",
        },
        {
          title: "AI tutor",
          icon: "sparkles-outline",
          href: "/inbox/ai-profile",
        },
        {
          title: "Theme",
          icon: "contrast-outline",
          status: themeLabel,
          onPress: cycleTheme,
        },
      ],
    },
    {
      key: "support",
      title: "Help",
      rows: [
        {
          title: "Help & support",
          icon: "headset-outline",
          href: "/support",
        },
        {
          title: "Download app updates",
          icon: "download-outline",
          externalUrl: DOWNLOAD_URL,
        },
        {
          title: "Terms of Service",
          icon: "document-text-outline",
          href: "/legal/terms",
        },
        {
          title: "Privacy Policy",
          icon: "shield-checkmark-outline",
          href: "/legal/privacy",
        },
        {
          title: "Version",
          icon: "information-circle-outline",
          status: APP_VERSION,
        },
      ],
    },
  ];

  async function onSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/(auth)/login");
    } finally {
      setSigningOut(false);
    }
  }

  async function handleRow(row: SettingsRow) {
    if (row.onPress) {
      row.onPress();
      return;
    }
    if (row.externalUrl) {
      await Linking.openURL(row.externalUrl);
      return;
    }
    if (row.href) router.push(row.href);
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        paddingTop: insets.top,
      }}
    >
      <View style={styles.top}>
        <Pressable
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/(tabs)");
          }}
          style={styles.back}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.fg} />
        </Pressable>
        <AppText size={18} weight="700">
          Settings
        </AppText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 16) + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {groups.map((group) => (
          <View key={group.key} style={{ gap: 8 }}>
            {group.title ? (
              <AppText muted size={12} weight="600" style={styles.sectionLabel}>
                {group.title.toUpperCase()}
              </AppText>
            ) : null}
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              {group.rows.map((row, index) => (
                <Pressable
                  key={row.title}
                  onPress={() => void handleRow(row)}
                  style={({ pressed }) => [
                    styles.row,
                    index < group.rows.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.border,
                    },
                    pressed && { opacity: 0.72 },
                  ]}
                >
                  <Ionicons name={row.icon} size={22} color={colors.accent} />
                  <AppText size={15} weight="500" style={{ flex: 1 }}>
                    {row.title}
                  </AppText>
                  {row.status ? (
                    <AppText size={13} muted style={{ marginRight: 4 }}>
                      {row.status}
                    </AppText>
                  ) : null}
                  {row.href || row.externalUrl || row.onPress ? (
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={colors.muted}
                    />
                  ) : null}
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <Pressable
          onPress={() => void onSignOut()}
          disabled={signingOut}
          style={({ pressed }) => [
            styles.signOut,
            {
              backgroundColor: colors.surface,
              opacity: signingOut || pressed ? 0.7 : 1,
            },
          ]}
        >
          <AppText size={15} weight="600" style={{ color: colors.danger }}>
            {signingOut ? "Signing out…" : "Sign Out"}
          </AppText>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 16,
    gap: 16,
    paddingTop: 8,
  },
  sectionLabel: {
    marginLeft: 4,
  },
  card: {
    borderRadius: radii.md,
    overflow: "hidden",
  },
  row: {
    minHeight: 54,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  signOut: {
    marginTop: 4,
    minHeight: 54,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
