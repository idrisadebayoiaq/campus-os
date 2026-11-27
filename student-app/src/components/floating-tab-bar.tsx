import { Ionicons } from "@expo/vector-icons";
import { router, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStudentKind } from "@/src/lib/student-kind";
import { useTenancy } from "@/src/lib/tenancy";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type TabRoute = { key: string; name: string; params?: object };
type TabBarProps = {
  state: { index: number; routes: TabRoute[] };
};

const PRIMARY_TABS = [
  {
    name: "index",
    label: "Home",
    href: "/(tabs)",
    active: "home" as const,
    idle: "home-outline" as const,
  },
  {
    name: "housing",
    label: "Housing",
    href: "/(tabs)/housing",
    active: "business" as const,
    idle: "business-outline" as const,
  },
  {
    name: "marketplace",
    label: "Market",
    href: "/(tabs)/marketplace",
    active: "storefront" as const,
    idle: "storefront-outline" as const,
  },
  {
    name: "ai",
    label: "AI",
    href: "/study/ai",
    active: "sparkles" as const,
    idle: "sparkles-outline" as const,
  },
];

const MORE_MENU = [
  {
    title: "Profile",
    href: "/(tabs)/profile",
    icon: "person-outline" as const,
  },
  {
    title: "Settings",
    href: "/settings",
    icon: "settings-outline" as const,
  },
  {
    title: "AI study",
    href: "/study/ai",
    icon: "sparkles-outline" as const,
  },
  {
    title: "Chat",
    href: "/(tabs)/inbox",
    icon: "chatbubble-outline" as const,
  },
  {
    title: "Classes",
    href: "/study/classes",
    icon: "school-outline" as const,
  },
  {
    title: "Lecturer tools",
    href: "/lecturer",
    icon: "easel-outline" as const,
  },
];

const EXAM_STUDY_TAB = {
  name: "study",
  label: "Study",
  href: "/(tabs)/study",
  active: "book" as const,
  idle: "book-outline" as const,
};

const EXAM_MORE_MENU = [
  { title: "Profile", href: "/(tabs)/profile", icon: "person-outline" as const },
  { title: "Settings", href: "/settings", icon: "settings-outline" as const },
  { title: "Exam goals", href: "/exam-goals", icon: "flag-outline" as const },
  { title: "AI tutor", href: "/study/ai", icon: "sparkles-outline" as const },
  { title: "Past Questions", href: "/study/past-questions", icon: "document-text-outline" as const },
  { title: "Chat", href: "/(tabs)/inbox", icon: "chatbubble-outline" as const },
];

export function FloatingTabBar({ state }: TabBarProps) {
  const colors = useTheme();
  const { isExamPrep } = useStudentKind();
  // Exam candidates browse housing and the market around the school they want. The AI tab makes
  // way for the Study hub (the AI tutor stays in the menu and on Home).
  const { hasActiveHome } = useTenancy();
  // Once a student has collected a house, the Housing tab makes way: their apartment lives in
  // Settings, and "Find new house" still reaches the marketplace from there.
  const basePrimary = hasActiveHome ? PRIMARY_TABS.filter((t) => t.name !== "housing") : PRIMARY_TABS;
  const primaryTabs = isExamPrep
    ? PRIMARY_TABS.map((t) => (t.name === "ai" ? EXAM_STUDY_TAB : t))
    : basePrimary;
  const primaryNames = isExamPrep
    ? new Set(["index", "housing", "marketplace", "study"])
    : new Set(primaryTabs.map((t) => t.name));
  const moreMenu = isExamPrep ? EXAM_MORE_MENU : MORE_MENU;
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const [moreOpen, setMoreOpen] = useState(false);
  const lightBar =
    colors.tabBar.toLowerCase() === "#ab9ff2" ||
    colors.tabBar.toLowerCase() === "#f2f2f2" ||
    colors.tabBar.toLowerCase() === "#ffffff";

  const activeName = state.routes[state.index]?.name;
  const onSecondaryTab = Boolean(
    activeName && !primaryNames.has(activeName),
  );

  // Show on every screen inside (tabs), including Profile / Chat / Study Hub.
  // Hide only when a root Stack screen (settings, study/*, etc.) is focused.
  const segmentList = segments as string[];
  const inTabsGroup = segmentList[0] === "(tabs)";
  const showBar = inTabsGroup;

  useEffect(() => {
    setMoreOpen(false);
  }, [activeName, showBar]);

  if (!showBar) return null;

  return (
    <>
      <Modal
        visible={moreOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMoreOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setMoreOpen(false)}>
          <View
            style={[
              styles.speedDial,
              { paddingBottom: Math.max(insets.bottom, 14) + 84 },
            ]}
            pointerEvents="box-none"
          >
            {moreMenu.map((item) => (
              <Pressable
                key={item.title}
                onPress={() => {
                  setMoreOpen(false);
                  router.navigate(item.href as never);
                }}
                style={styles.speedRow}
              >
                <Text style={[styles.speedLabel, { color: "#fff" }]}>
                  {item.title}
                </Text>
                <View
                  style={[
                    styles.speedIcon,
                    { backgroundColor: colors.surface },
                  ]}
                >
                  <Ionicons name={item.icon} size={20} color={colors.fg} />
                </View>
              </Pressable>
            ))}
            <Pressable
              onPress={() => setMoreOpen(false)}
              style={[styles.closeBtn, { backgroundColor: colors.tabBar }]}
            >
              <Ionicons name="close" size={22} color={colors.tabIconActive} />
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <View
        pointerEvents="box-none"
        style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 14) }]}
      >
        <View style={[styles.bar, { backgroundColor: colors.tabBar }]}>
          {primaryTabs.map((tab) => {
            const focused = activeName === tab.name;
            return (
              <Pressable
                key={tab.name}
                accessibilityRole="button"
                accessibilityState={focused ? { selected: true } : {}}
                accessibilityLabel={tab.label}
                hitSlop={8}
                onPress={() => {
                  if (focused) return;
                  router.navigate(tab.href as never);
                }}
                style={styles.item}
              >
                <View
                  style={[
                    styles.iconWrap,
                    focused && {
                      backgroundColor: lightBar
                        ? "rgba(0,0,0,0.08)"
                        : "rgba(255,255,255,0.14)",
                    },
                  ]}
                >
                  <Ionicons
                    name={focused ? tab.active : tab.idle}
                    size={22}
                    color={focused ? colors.tabIconActive : colors.tabIcon}
                  />
                </View>
              </Pressable>
            );
          })}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More"
            hitSlop={8}
            onPress={() => setMoreOpen(true)}
            style={styles.item}
          >
            <View
              style={[
                styles.iconWrap,
                (moreOpen || onSecondaryTab) && {
                  backgroundColor: lightBar
                    ? "rgba(0,0,0,0.08)"
                    : "rgba(255,255,255,0.14)",
                },
              ]}
            >
              <Ionicons
                name={moreOpen || onSecondaryTab ? "grid" : "grid-outline"}
                size={22}
                color={
                  moreOpen || onSecondaryTab
                    ? colors.tabIconActive
                    : colors.tabIcon
                }
              />
            </View>
          </Pressable>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "78%",
    maxWidth: 340,
    minHeight: 66,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  speedDial: {
    alignItems: "flex-end",
    paddingHorizontal: 28,
    gap: 14,
  },
  speedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  speedLabel: {
    fontSize: 15,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  speedIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
});
