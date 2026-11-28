import { Ionicons } from "@expo/vector-icons";
import { Image, Linking, Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/src/components/ui";
import {
  decodeLocation,
  formatBytes,
  formatDuration,
  signedUrls,
  useSignedUrl,
  type Attachment,
} from "@/src/lib/chat-media";
import { previewForMessage, type ChatMessage, type Reaction } from "@/src/lib/messaging";
import { useTheme } from "@/src/theme/ThemeProvider";

export type ViewerMedia = { kind: "image" | "video"; url: string; name?: string | null };

function ImageTile({ att, onOpen }: { att: Attachment; onOpen: (m: ViewerMedia) => void }) {
  const colors = useTheme();
  const url = useSignedUrl(att.path);
  const ratio = att.width && att.height ? Math.min(Math.max(att.width / att.height, 0.6), 1.6) : 1;
  return (
    <Pressable
      onPress={() => url && onOpen({ kind: "image", url, name: att.name })}
      style={[styles.media, { aspectRatio: ratio, backgroundColor: colors.surface }]}
    >
      {url ? <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
    </Pressable>
  );
}

function VideoTile({ att, onOpen }: { att: Attachment; onOpen: (m: ViewerMedia) => void }) {
  const open = async () => {
    const urls = await signedUrls([att.path]);
    const url = urls[att.path];
    if (url) onOpen({ kind: "video", url, name: att.name });
  };
  return (
    <Pressable onPress={() => void open()} style={[styles.media, styles.video]}>
      <View style={styles.play}>
        <Ionicons name="play" size={26} color="#fff" />
      </View>
      {att.duration_ms ? (
        <View style={styles.duration}>
          <Ionicons name="videocam" size={12} color="#fff" />
          <AppText size={11} weight="700" style={{ color: "#fff" }}>
            {formatDuration(att.duration_ms)}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

function FileRow({ att }: { att: Attachment }) {
  const colors = useTheme();
  const open = async () => {
    const urls = await signedUrls([att.path]);
    if (urls[att.path]) void Linking.openURL(urls[att.path]);
  };
  return (
    <Pressable onPress={() => void open()} style={[styles.file, { backgroundColor: colors.accentSoft }]}>
      <Ionicons name="document-text" size={26} color={colors.fg} />
      <View style={{ flex: 1 }}>
        <AppText weight="600" size={14} numberOfLines={2}>
          {att.name || "File"}
        </AppText>
        <AppText muted size={11}>
          {[(att.name?.split(".").pop() || "").toUpperCase(), formatBytes(att.size_bytes)].filter(Boolean).join(" · ")}
        </AppText>
      </View>
      <Ionicons name="download-outline" size={20} color={colors.fg} />
    </Pressable>
  );
}

export function AttachmentList({ items, onOpen }: { items: Attachment[]; onOpen: (m: ViewerMedia) => void }) {
  if (!items.length) return null;
  const visual = items.filter((a) => a.kind === "image" || a.kind === "video");
  const files = items.filter((a) => a.kind === "file" || a.kind === "audio");
  return (
    <View style={{ gap: 4, marginBottom: 4 }}>
      {visual.length === 1 ? (
        visual[0].kind === "image" ? (
          <ImageTile att={visual[0]} onOpen={onOpen} />
        ) : (
          <VideoTile att={visual[0]} onOpen={onOpen} />
        )
      ) : visual.length > 1 ? (
        <View style={styles.grid}>
          {visual.map((a) => (
            <View key={a.id} style={styles.cell}>
              {a.kind === "image" ? <ImageTile att={{ ...a, width: 1, height: 1 }} onOpen={onOpen} /> : <VideoTile att={a} onOpen={onOpen} />}
            </View>
          ))}
        </View>
      ) : null}
      {files.map((a) => (
        <FileRow key={a.id} att={a} />
      ))}
    </View>
  );
}

export function LocationCard({ body }: { body: string }) {
  const colors = useTheme();
  const loc = decodeLocation(body);
  if (!loc) return null;
  return (
    <Pressable
      onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`)}
      style={[styles.file, { backgroundColor: colors.accentSoft }]}
    >
      <Ionicons name="location" size={26} color={colors.danger} />
      <View style={{ flex: 1 }}>
        <AppText weight="600" size={14} numberOfLines={2}>
          {loc.label || "Shared location"}
        </AppText>
        <AppText muted size={11}>
          Tap to open in Maps
        </AppText>
      </View>
    </Pressable>
  );
}

/** The quoted message above a reply. */
export function ReplyQuote({
  original,
  nameOf,
  onPress,
}: {
  original: ChatMessage | null;
  nameOf: (id: string | null) => string;
  onPress?: () => void;
}) {
  const colors = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.quote, { backgroundColor: "rgba(124,92,214,0.12)", borderLeftColor: colors.accent }]}>
      <AppText size={12} weight="700" numberOfLines={1} style={{ color: colors.accent }}>
        {original ? nameOf(original.sender_id) : "Message"}
      </AppText>
      <AppText size={13} muted numberOfLines={2}>
        {original ? previewForMessage(original) || "Message" : "This message is no longer available"}
      </AppText>
    </Pressable>
  );
}

export function ReactionChips({
  items,
  myId,
  onPress,
}: {
  items: Reaction[];
  myId: string | undefined;
  onPress: (emoji: string) => void;
}) {
  const colors = useTheme();
  if (!items.length) return null;
  const counts = new Map<string, { n: number; mine: boolean }>();
  for (const r of items) {
    const cur = counts.get(r.emoji) ?? { n: 0, mine: false };
    counts.set(r.emoji, { n: cur.n + 1, mine: cur.mine || r.user_id === myId });
  }
  return (
    <View style={styles.reactions}>
      {[...counts.entries()].map(([emoji, v]) => (
        <Pressable
          key={emoji}
          onPress={() => onPress(emoji)}
          style={[
            styles.reaction,
            { backgroundColor: v.mine ? colors.accentSoft : colors.surface, borderColor: v.mine ? colors.accent : colors.border },
          ]}
        >
          <AppText size={13}>{emoji}</AppText>
          {v.n > 1 ? (
            <AppText size={11} weight="700">
              {v.n}
            </AppText>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  media: { width: 230, maxWidth: "100%", borderRadius: 10, overflow: "hidden" },
  video: { aspectRatio: 1.4, backgroundColor: "#1b1530", alignItems: "center", justifyContent: "center" },
  play: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  duration: {
    position: "absolute",
    left: 8,
    bottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 4, width: 230 },
  cell: { width: 113 },
  file: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, minWidth: 210 },
  quote: { borderLeftWidth: 3, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 4, gap: 1 },
  reactions: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 3 },
  reaction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
