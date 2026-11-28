import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Image, Modal, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, Avatar } from "@/src/components/ui";
import { conversationTitle, type ConversationListItem } from "@/src/lib/messaging";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

type Icon = keyof typeof Ionicons.glyphMap;

function SheetFrame({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          onPress={() => undefined}
          style={[styles.sheet, { backgroundColor: colors.bg, paddingBottom: Math.max(insets.bottom, 12) + 8 }]}
        >
          <View style={[styles.grab, { backgroundColor: colors.border }]} />
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export type AttachChoice = "gallery" | "camera" | "document" | "location";

export function AttachSheet({
  visible,
  onClose,
  onChoose,
}: {
  visible: boolean;
  onClose: () => void;
  onChoose: (c: AttachChoice) => void;
}) {
  const colors = useTheme();
  const items: { key: AttachChoice; label: string; icon: Icon; tint: string }[] = [
    { key: "gallery", label: "Photos & videos", icon: "images", tint: "#7C5CD6" },
    { key: "camera", label: "Camera", icon: "camera", tint: "#D9480F" },
    { key: "document", label: "File", icon: "document-text", tint: "#1971C2" },
    { key: "location", label: "Location", icon: "location", tint: "#2B8A3E" },
  ];
  return (
    <SheetFrame visible={visible} onClose={onClose}>
      <View style={styles.grid}>
        {items.map((it) => (
          <Pressable
            key={it.key}
            style={styles.gridItem}
            onPress={() => {
              onClose();
              onChoose(it.key);
            }}
          >
            <View style={[styles.gridIcon, { backgroundColor: it.tint }]}>
              <Ionicons name={it.icon} size={24} color="#fff" />
            </View>
            <AppText size={12} weight="600" style={{ textAlign: "center", color: colors.fg }}>
              {it.label}
            </AppText>
          </Pressable>
        ))}
      </View>
      <AppText muted size={12} style={{ textAlign: "center", marginTop: 6 }}>
        Videos up to 3 minutes and 50 MB. Files up to 25 MB.
      </AppText>
    </SheetFrame>
  );
}

export type MessageAction =
  | "reply"
  | "copy"
  | "forward"
  | "star"
  | "edit"
  | "read"
  | "delete-me"
  | "delete-all";

export function MessageSheet({
  visible,
  onClose,
  onReact,
  onAction,
  myReaction,
  starred,
  can,
}: {
  visible: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onAction: (a: MessageAction) => void;
  myReaction: string | null;
  starred: boolean;
  can: { copy: boolean; forward: boolean; edit: boolean; read: boolean; deleteAll: boolean; react: boolean };
}) {
  const colors = useTheme();
  const rows: { key: MessageAction; label: string; icon: Icon; danger?: boolean; show: boolean }[] = [
    { key: "reply", label: "Reply", icon: "arrow-undo-outline", show: true },
    { key: "copy", label: "Copy", icon: "copy-outline", show: can.copy },
    { key: "forward", label: "Forward", icon: "arrow-redo-outline", show: can.forward },
    { key: "star", label: starred ? "Unstar" : "Star", icon: starred ? "star" : "star-outline", show: true },
    { key: "read", label: "Read aloud", icon: "volume-medium-outline", show: can.read },
    { key: "edit", label: "Edit", icon: "create-outline", show: can.edit },
    { key: "delete-me", label: "Delete for me", icon: "eye-off-outline", show: true },
    { key: "delete-all", label: "Delete for everyone", icon: "trash-outline", danger: true, show: can.deleteAll },
  ];
  return (
    <SheetFrame visible={visible} onClose={onClose}>
      {can.react ? (
        <View style={styles.emojiRow}>
          {QUICK_REACTIONS.map((e) => (
            <Pressable
              key={e}
              onPress={() => {
                onClose();
                onReact(e);
              }}
              style={[styles.emoji, myReaction === e && { backgroundColor: colors.accentSoft }]}
            >
              <AppText size={26}>{e}</AppText>
            </Pressable>
          ))}
        </View>
      ) : null}
      {rows
        .filter((r) => r.show)
        .map((r) => (
          <Pressable
            key={r.key}
            style={styles.actionRow}
            onPress={() => {
              onClose();
              onAction(r.key);
            }}
          >
            <Ionicons name={r.icon} size={20} color={r.danger ? colors.danger : colors.fg} />
            <AppText weight="600" style={{ color: r.danger ? colors.danger : colors.fg }}>
              {r.label}
            </AppText>
          </Pressable>
        ))}
    </SheetFrame>
  );
}

export function ForwardSheet({
  visible,
  onClose,
  chats,
  currentId,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  chats: ConversationListItem[];
  currentId: string;
  onPick: (conversationId: string) => void;
}) {
  const colors = useTheme();
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!visible) setQ("");
  }, [visible]);
  const list = useMemo(
    () =>
      chats
        .filter((c) => c.id !== currentId && c.kind !== "listing" && c.kind !== "order")
        .map((c) => ({ c, title: conversationTitle({ kind: c.kind, subject: c.subject, peerName: c.peerName }) }))
        .filter((x) => !q.trim() || x.title.toLowerCase().includes(q.trim().toLowerCase())),
    [chats, currentId, q],
  );
  return (
    <SheetFrame visible={visible} onClose={onClose}>
      <AppText weight="700" size={17} style={{ marginBottom: 8 }}>
        Forward to
      </AppText>
      <View style={[styles.search, { backgroundColor: colors.surface }]}>
        <Ionicons name="search" size={16} color={colors.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search chats"
          placeholderTextColor={colors.muted}
          style={{ flex: 1, color: colors.fg, fontSize: 15, paddingVertical: 8 }}
        />
      </View>
      <FlatList
        data={list}
        keyExtractor={(x) => x.c.id}
        style={{ maxHeight: 360 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <AppText muted style={{ textAlign: "center", paddingVertical: 24 }}>
            No chats to forward to.
          </AppText>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.actionRow}
            onPress={() => {
              onClose();
              onPick(item.c.id);
            }}
          >
            <Avatar label={item.title} size={38} uri={item.c.peerAvatar} />
            <AppText weight="600" numberOfLines={1} style={{ flex: 1 }}>
              {item.title}
            </AppText>
          </Pressable>
        )}
      />
    </SheetFrame>
  );
}

/** Full-screen photo or video. */
export function MediaViewer({
  media,
  onClose,
}: {
  media: { kind: "image" | "video"; url: string; name?: string | null } | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={Boolean(media)} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.viewer}>
        {media?.kind === "image" ? (
          <Image source={{ uri: media.url }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        ) : media ? (
          <VideoClip url={media.url} />
        ) : null}
        <Pressable onPress={onClose} style={[styles.viewerClose, { top: insets.top + 8 }]} accessibilityLabel="Close">
          <Ionicons name="close" size={24} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

function VideoClip({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls contentFit="contain" />;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 8 },
  grab: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-around", paddingVertical: 8 },
  gridItem: { width: "22%", alignItems: "center", gap: 8 },
  gridIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  emojiRow: { flexDirection: "row", justifyContent: "space-between", paddingBottom: 8 },
  emoji: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13, paddingHorizontal: 4 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, borderRadius: radii.pill, marginBottom: 8 },
  viewer: { flex: 1, backgroundColor: "#000" },
  viewerClose: {
    position: "absolute",
    right: 12,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
});
