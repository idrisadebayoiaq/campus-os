import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RoleBadges, useRoleBadges } from "@/src/components/role-badges";
import { AppText, Avatar } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { conversationTitle, kindLabel, loadChatFaces, type ChatPerson } from "@/src/lib/messaging";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

export default function ChatInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("Chat");
  const [about, setAbout] = useState<string | null>(null);
  const [kind, setKind] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [members, setMembers] = useState<ChatPerson[]>([]);
  const [muted, setMuted] = useState(false);
  const [personId, setPersonId] = useState<string | null>(null);
  const badges = useRoleBadges(personId);

  useEffect(() => {
    if (!id || !user) return;
    let cancelled = false;
    async function load() {
      const [{ data: conv }, { data: me }] = await Promise.all([
        supabase.from("conversations").select("kind, subject, business_id").eq("id", id).maybeSingle(),
        supabase
          .from("conversation_participants")
          .select("muted")
          .eq("conversation_id", id)
          .eq("user_id", user!.id)
          .maybeSingle(),
      ]);
      if (cancelled || !conv) return;
      const faces = await loadChatFaces(supabase, user!.id, [
        { id, kind: conv.kind, businessId: (conv.business_id as string | null) ?? null },
      ]);
      const face = faces.get(id);
      setKind(conv.kind);
      setMembers(face?.members ?? []);
      setPersonId(face?.person?.id ?? null);
      setAvatarUrl(face?.person?.avatarUrl ?? face?.avatarUrl ?? null);
      setTitle(
        face?.person?.name ||
          conversationTitle({ kind: conv.kind, subject: conv.subject, peerName: face?.name }),
      );
      const generic = !conv.subject || /^(chat|group|group chat)$/i.test(conv.subject.trim());
      setAbout(!generic && conv.subject !== face?.person?.name ? conv.subject : null);
      setMuted(Boolean(me?.muted));
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, user]);

  async function toggleMute() {
    if (!id || !user) return;
    const next = !muted;
    setMuted(next);
    await supabase
      .from("conversation_participants")
      .update({ muted: next })
      .eq("conversation_id", id)
      .eq("user_id", user.id);
  }

  return (
    <View
      style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}
    >
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.fg} />
        </Pressable>
        <AppText size={18} weight="700">
          Chat info
        </AppText>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
        <View style={{ alignItems: "center", gap: 8 }}>
          <Avatar label={title} size={88} uri={avatarUrl} />
          <AppText size={20} weight="700">
            {title}
          </AppText>
          <AppText muted>{kind === "group" ? kindLabel(kind) : about || kindLabel(kind)}</AppText>
          <RoleBadges badges={badges} center fg={colors.fg} bg={colors.accentSoft} />
        </View>

        <Pressable
          onPress={() => void toggleMute()}
          style={[styles.row, { backgroundColor: colors.surface }]}
        >
          <Ionicons
            name={muted ? "notifications-off-outline" : "notifications-outline"}
            size={20}
            color={colors.fg}
          />
          <AppText style={{ flex: 1 }}>{muted ? "Unmute" : "Mute"}</AppText>
        </Pressable>

        {kind === "group" && members.length > 0 ? (
          <>
            <AppText weight="700">Members · {members.length}</AppText>
            {members.map((m) => (
              <View key={m.id} style={[styles.row, { backgroundColor: colors.surface }]}>
                <Avatar label={m.name} size={36} uri={m.avatarUrl} />
                <View style={{ flex: 1 }}>
                  <AppText weight="600">{m.name}</AppText>
                  <AppText muted size={12}>
                    {m.id === user?.id ? "You" : m.role}
                  </AppText>
                </View>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  back: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    minHeight: 52,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
