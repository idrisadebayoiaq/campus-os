import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { notify } from "@/src/lib/feedback";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type NotificationRow = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

function iconFor(n: NotificationRow): keyof typeof Ionicons.glyphMap {
  const link = n.link ?? "";
  const title = n.title.toLowerCase();
  if (link.startsWith("/housing") || title.includes("viewing")) return "business-outline";
  if (link.startsWith("/apartment") || link.startsWith("/my-room") || title.includes("rent")) return "home-outline";
  if (title.includes("order")) return "bag-handle-outline";
  if (link.startsWith("/verify")) return "shield-checkmark-outline";
  if (link.startsWith("/meetings")) return "videocam-outline";
  if (link.startsWith("/support")) return "headset-outline";
  if (link.startsWith("/study/assignments")) return "document-text-outline";
  if (link.startsWith("/study")) return "school-outline";
  return "notifications-outline";
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function sectionFor(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (d.getTime() >= startOfToday) return "Today";
  if (d.getTime() >= startOfToday - 6 * 86400000) return "This week";
  return "Earlier";
}

export default function NotificationsScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error: qErr } = await supabase
      .from("notifications")
      .select("id, title, body, link, is_read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (qErr) setError(qErr.message);
    else {
      setError(null);
      setRows((data as NotificationRow[]) || []);
    }
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, load]);

  const unread = rows.filter((r) => !r.is_read).length;

  const sections = useMemo(() => {
    const order = ["Today", "This week", "Earlier"];
    const map = new Map<string, NotificationRow[]>();
    for (const r of rows) {
      const key = sectionFor(r.created_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return order
      .filter((k) => map.has(k))
      .map((k) => ({ title: k, data: map.get(k)! }));
  }, [rows]);

  async function markAllRead() {
    if (!user || !unread) return;
    setRows((prev) => prev.map((r) => ({ ...r, is_read: true })));
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
  }

  async function open(n: NotificationRow) {
    if (!n.is_read) {
      setRows((prev) => prev.map((r) => (r.id === n.id ? { ...r, is_read: true } : r)));
      void supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
    }
    if (n.link?.startsWith("/")) router.push(n.link as Href);
  }

  async function remove(n: NotificationRow) {
    setRows((prev) => prev.filter((r) => r.id !== n.id));
    const { error: delErr } = await supabase.from("notifications").delete().eq("id", n.id);
    if (delErr) {
      setError(delErr.message);
      void load();
    }
  }

  function clearAll() {
    if (!user || !rows.length) return;
    notify("Clear all notifications?", "They'll be removed from this list.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear all",
        style: "destructive",
        onPress: () => {
          setRows([]);
          supabase
            .from("notifications")
            .delete()
            .eq("user_id", user.id)
            .then(({ error: delErr }) => {
              if (delErr) {
                setError(delErr.message);
                void load();
              }
            });
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.top}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))}
          style={[styles.back, { backgroundColor: colors.surface }]}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={20} color={colors.fg} />
        </Pressable>
        <AppText size={18} weight="700">
          Notifications
        </AppText>
        <View style={{ flexDirection: "row", gap: 4 }}>
          <Pressable
            onPress={() => void markAllRead()}
            disabled={!unread}
            style={[styles.back, { opacity: unread ? 1 : 0.35 }]}
            accessibilityLabel="Mark all as read"
          >
            <Ionicons name="checkmark-done" size={22} color={colors.fg} />
          </Pressable>
          <Pressable
            onPress={clearAll}
            disabled={!rows.length}
            style={[styles.back, { opacity: rows.length ? 1 : 0.35 }]}
            accessibilityLabel="Clear all notifications"
          >
            <Ionicons name="trash-outline" size={21} color={colors.fg} />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.fg} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: Math.max(insets.bottom, 16) + 24,
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor={colors.fg}
            />
          }
          ListHeaderComponent={
            <View style={{ paddingHorizontal: 4, paddingBottom: 4 }}>
              {error ? (
                <AppText size={13} style={{ color: colors.danger }}>
                  {error}
                </AppText>
              ) : unread ? (
                <AppText muted size={13}>
                  {unread} unread
                </AppText>
              ) : null}
            </View>
          }
          renderSectionHeader={({ section }) => (
            <AppText muted size={12} weight="600" style={styles.sectionLabel}>
              {section.title.toUpperCase()}
            </AppText>
          )}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => void open(item)}
              onLongPress={() => void remove(item)}
              style={({ pressed }) => [
                styles.item,
                {
                  backgroundColor: item.is_read ? "transparent" : colors.surface,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name={iconFor(item)} size={20} color={colors.fg} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.titleRow}>
                  <AppText
                    size={15}
                    weight={item.is_read ? "500" : "700"}
                    numberOfLines={1}
                    style={{ flex: 1 }}
                  >
                    {item.title}
                  </AppText>
                  <AppText muted size={12}>
                    {timeAgo(item.created_at)}
                  </AppText>
                </View>
                {item.body ? (
                  <AppText muted size={13} numberOfLines={2}>
                    {item.body}
                  </AppText>
                ) : null}
              </View>
              {!item.is_read ? (
                <View style={[styles.dot, { backgroundColor: colors.accent }]} />
              ) : null}
              <Pressable onPress={() => void remove(item)} hitSlop={10} accessibilityLabel="Delete notification">
                <Ionicons name="close" size={18} color={colors.muted} />
              </Pressable>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
                <Ionicons name="notifications-outline" size={30} color={colors.muted} />
              </View>
              <AppText size={17} weight="700">
                You’re all caught up
              </AppText>
              <AppText muted size={13} style={{ textAlign: "center", maxWidth: 280 }}>
                Updates on viewings, orders, classes, and support replies will show
                up here.
              </AppText>
            </View>
          }
          ListFooterComponent={
            rows.length ? (
              <AppText muted size={12} style={{ textAlign: "center", marginTop: 16 }}>
                Tap ✕ to remove a notification, or use the bin to clear all.
              </AppText>
            ) : undefined
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionLabel: { marginTop: 16, marginBottom: 8, marginLeft: 4 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: radii.md,
    marginBottom: 4,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 80 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
});
