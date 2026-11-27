import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  AppText,
  Avatar,
  EmptyState,
  Screen,
  TAB_BAR_CLEARANCE,
} from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import {
  INBOX_FILTERS,
  clearConversation,
  conversationTitle,
  deleteConversation,
  createGroupChat,
  kindLabel,
  loadConversations,
  startDirectChat,
  type ConversationListItem,
} from "@/src/lib/messaging";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

function when(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  if (today.getTime() - d.getTime() < 6 * 86400000) {
    return d.toLocaleDateString(undefined, { weekday: "long" });
  }
  return d.toLocaleDateString(undefined, { day: "numeric", month: "numeric", year: "2-digit" });
}

export default function InboxScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const [rows, setRows] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [peerEmail, setPeerEmail] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [composeBusy, setComposeBusy] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      setError(null);
      const list = await loadConversations(supabase, user.id);
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load chats");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`inbox-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byKind =
      filter === "all"
        ? rows
        : filter === "unread"
          ? rows.filter((r) => r.unread)
          : filter === "order"
            ? rows.filter((r) => r.kind === "order" || r.kind === "listing")
            : rows.filter((r) => r.kind === filter);
    if (!q) return byKind;
    return byKind.filter((r) =>
      `${conversationTitle({ kind: r.kind, subject: r.subject, peerName: r.peerName })} ${r.lastMessage ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [rows, filter, search]);

  function onRowMenu(conversationId: string, title: string) {
    Alert.alert(title, undefined, [
      {
        text: "Clear chat",
        onPress: () =>
          clearConversation(supabase, conversationId)
            .then(() => refresh())
            .catch((e) => setError(e?.message ?? "Could not clear the chat")),
      },
      {
        text: "Delete chat",
        style: "destructive",
        onPress: () => {
          setRows((prev) => prev.filter((r) => r.id !== conversationId));
          deleteConversation(supabase, conversationId).catch((e) => {
            setError(e?.message ?? "Could not delete the chat");
            void refresh();
          });
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function startDm() {
    if (!user || !peerEmail.trim()) return;
    setComposeBusy(true);
    setComposeError(null);
    try {
      const raw = peerEmail.trim();
      let peerId: string | undefined;
      if (/^[0-9a-f-]{36}$/i.test(raw)) {
        peerId = raw;
      } else if (raw.includes("@")) {
        const { data } = await supabase.rpc("lookup_user_id_by_email", {
          p_email: raw,
        });
        peerId = (data as string | null) ?? undefined;
      } else {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, full_name, preferred_name, first_name")
          .or(
            `full_name.ilike.%${raw}%,preferred_name.ilike.%${raw}%,first_name.ilike.%${raw}%`,
          )
          .limit(1)
          .maybeSingle();
        peerId = profile?.id as string | undefined;
      }
      if (!peerId) {
        setComposeError(
          "No CampusOS account found.",
        );
        return;
      }
      const id = await startDirectChat(supabase, {
        userId: user.id,
        peerId,
      });
      setComposeOpen(false);
      setPeerEmail("");
      router.push(`/inbox/${id}`);
    } catch (e) {
      setComposeError(e instanceof Error ? e.message : "Could not start chat");
    } finally {
      setComposeBusy(false);
    }
  }

  async function startGroup() {
    if (!user || !groupTitle.trim()) return;
    setComposeBusy(true);
    setComposeError(null);
    try {
      const id = await createGroupChat(supabase, {
        creatorId: user.id,
        title: groupTitle.trim(),
        memberIds: [],
      });
      setComposeOpen(false);
      setGroupTitle("");
      router.push(`/inbox/${id}`);
    } catch (e) {
      setComposeError(e instanceof Error ? e.message : "Could not create group");
    } finally {
      setComposeBusy(false);
    }
  }

  return (
    <Screen padded={false} tabClearance>
      <View style={styles.header}>
        <AppText size={26} weight="700" style={{ flex: 1 }}>
          Chats
        </AppText>
        <Pressable
          onPress={() => setComposeOpen(true)}
          style={[styles.fabSmall, { backgroundColor: colors.inverseBg }]}
          accessibilityLabel="New chat"
        >
          <Ionicons name="create-outline" size={20} color={colors.inverseFg} />
        </Pressable>
      </View>

      <View style={[styles.search, { backgroundColor: colors.surface }]}>
        <Ionicons name="search" size={17} color={colors.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search"
          placeholderTextColor={colors.muted}
          style={{ flex: 1, color: colors.fg, fontSize: 15, paddingVertical: 8 }}
        />
        {search ? (
          <Pressable onPress={() => setSearch("")} hitSlop={10}>
            <Ionicons name="close-circle" size={17} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <FlatList
        horizontal
        data={INBOX_FILTERS as unknown as { key: string; label: string }[]}
        keyExtractor={(item) => item.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        style={{ flexGrow: 0, marginBottom: 4 }}
        renderItem={({ item }) => {
          const active = filter === item.key;
          return (
            <Pressable
              onPress={() => setFilter(item.key)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.inverseBg : colors.surface,
                },
              ]}
            >
              <AppText
                size={12}
                weight="600"
                style={{ color: active ? colors.inverseFg : colors.fg }}
              >
                {item.label}
              </AppText>
            </Pressable>
          );
        }}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.fg} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingBottom: TAB_BAR_CLEARANCE,
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void refresh();
              }}
              tintColor={colors.fg}
            />
          }
          ListHeaderComponent={
            error ? (
              <AppText
                size={13}
                style={{ color: colors.danger, paddingHorizontal: 20 }}
              >
                {error}
              </AppText>
            ) : (
              <View />
            )
          }
          ListEmptyComponent={
            <View style={{ padding: 20 }}>
              <EmptyState
                title={search || filter !== "all" ? "No matching chats" : "No chats yet"}
                description={search || filter !== "all" ? "" : "Tap the pencil to start one."}
              />
            </View>
          }
          renderItem={({ item }) => {
            const title = conversationTitle({
              kind: item.kind,
              subject: item.subject,
              peerName: item.peerName,
            });
            const count = item.unreadCount ?? (item.unread ? 1 : 0);
            const tag = item.kind === "listing" || item.kind === "order" ? kindLabel(item.kind) : null;
            return (
              <Pressable
                onPress={() => router.push(`/inbox/${item.id}`)}
                onLongPress={() => onRowMenu(item.id, title)}
                style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surface : "transparent" }]}
              >
                <Avatar label={title} size={52} uri={item.peerAvatar} />
                <View style={[styles.rowBody, { borderBottomColor: colors.border }]}>
                  <View style={styles.rowTop}>
                    <AppText weight="700" size={16} numberOfLines={1} style={{ flex: 1 }}>
                      {title}
                    </AppText>
                    <AppText size={12} weight={count ? "700" : "400"} style={{ color: count ? colors.success : colors.muted }}>
                      {when(item.lastAt ?? item.updated_at)}
                    </AppText>
                  </View>
                  <View style={styles.rowTop}>
                    {item.lastFromMe ? <Ionicons name="checkmark-done" size={16} color={colors.muted} /> : null}
                    <AppText muted size={14} numberOfLines={1} style={{ flex: 1 }}>
                      {item.lastMessage || (tag ?? "Tap to chat")}
                    </AppText>
                    {item.muted ? <Ionicons name="volume-mute" size={15} color={colors.muted} /> : null}
                    {count ? (
                      <View style={[styles.unread, { backgroundColor: colors.success }]}>
                        <AppText size={11} weight="700" style={{ color: "#fff" }}>
                          {count > 99 ? "99+" : count}
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                  {tag && item.lastMessage ? (
                    <AppText size={11} weight="600" style={{ color: colors.accent }}>
                      {tag}
                    </AppText>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <Modal
        visible={composeOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setComposeOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            behavior="padding"
            keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 0}
          >
          <View style={[styles.modalCard, { backgroundColor: colors.bg }]}>
            <AppText weight="700" size={18}>
              New chat
            </AppText>
            <AppText muted size={13}>
              Email or name
            </AppText>
            <TextInput
              value={peerEmail}
              onChangeText={setPeerEmail}
              placeholder="student@school.edu"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              style={[
                styles.input,
                { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, borderWidth: 1.5, color: colors.fg },
              ]}
            />
            <Pressable
              onPress={() => void startDm()}
              disabled={composeBusy}
              style={[styles.primaryBtn, { backgroundColor: colors.accent }]}
            >
              <AppText weight="700" style={{ color: colors.onAccent }}>
                Start chat
              </AppText>
            </Pressable>

            <AppText muted size={13} style={{ marginTop: 8 }}>
              New group
            </AppText>
            <TextInput
              value={groupTitle}
              onChangeText={setGroupTitle}
              placeholder="Group name"
              placeholderTextColor={colors.muted}
              style={[
                styles.input,
                { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, borderWidth: 1.5, color: colors.fg },
              ]}
            />
            <Pressable
              onPress={() => void startGroup()}
              disabled={composeBusy}
              style={[styles.primaryBtn, { backgroundColor: colors.inverseBg }]}
            >
              <AppText weight="700" style={{ color: colors.inverseFg }}>
                Create group
              </AppText>
            </Pressable>

            {composeError ? (
              <AppText size={13} style={{ color: colors.danger }}>
                {composeError}
              </AppText>
            ) : null}
            <Pressable onPress={() => setComposeOpen(false)}>
              <AppText muted style={{ textAlign: "center", marginTop: 8 }}>
                Cancel
              </AppText>
            </Pressable>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  fabSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  filters: { paddingHorizontal: 16, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  search: {
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 16,
  },
  rowBody: {
    flex: 1,
    gap: 3,
    paddingVertical: 12,
    paddingRight: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  unread: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 10,
  },
  input: {
    height: 48,
    borderRadius: radii.md,
    paddingHorizontal: 14,
  },
  primaryBtn: {
    height: 48,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
