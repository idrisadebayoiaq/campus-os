import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
  conversationTitle,
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
  const diff = Date.now() - d.getTime();
  if (diff < 60 * 60 * 1000) return `${Math.max(1, Math.round(diff / 60000))}m`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.round(diff / 3600000)}h`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function InboxScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const [rows, setRows] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
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
    if (filter === "all") return rows;
    if (filter === "order") {
      return rows.filter((r) => r.kind === "order" || r.kind === "listing");
    }
    return rows.filter((r) => r.kind === filter);
  }, [rows, filter]);

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
          "No CampusOS account found. Check the email address and try again.",
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
        <View style={{ flex: 1 }}>
          <AppText size={24} weight="700">
            Chats
          </AppText>
          <AppText muted size={13}>
            Classmates, groups, agents and businesses
          </AppText>
        </View>
        <Pressable
          onPress={() => setComposeOpen(true)}
          style={[styles.fabSmall, { backgroundColor: colors.accent }]}
        >
          <Ionicons name="add" size={22} color={colors.onAccent} />
        </Pressable>
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
                title="No chats yet"
                description="Start a direct or group chat, or message an agent or business from their listing."
              />
            </View>
          }
          renderItem={({ item }) => {
            const title = conversationTitle({
              kind: item.kind,
              subject: item.subject,
            });
            return (
              <Pressable
                onPress={() => router.push(`/inbox/${item.id}`)}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: pressed ? colors.surface : "transparent",
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <Avatar label={title} size={52} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={styles.rowTop}>
                    <AppText weight="700" size={15} numberOfLines={1} style={{ flex: 1 }}>
                      {title}
                    </AppText>
                    <AppText muted size={11}>
                      {when(item.updated_at)}
                    </AppText>
                  </View>
                  <View style={styles.rowTop}>
                    <AppText muted size={13} numberOfLines={1} style={{ flex: 1 }}>
                      {item.lastMessage || kindLabel(item.kind)}
                    </AppText>
                    {item.unread ? (
                      <View
                        style={[
                          styles.unread,
                          { backgroundColor: colors.accent },
                        ]}
                      />
                    ) : null}
                  </View>
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
              Direct message by email
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
                Start direct chat
              </AppText>
            </Pressable>

            <AppText muted size={13} style={{ marginTop: 8 }}>
              Or create a group
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  unread: {
    width: 10,
    height: 10,
    borderRadius: 5,
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
