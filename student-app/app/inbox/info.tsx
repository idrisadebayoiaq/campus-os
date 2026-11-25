import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, Avatar } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { conversationTitle, kindLabel } from "@/src/lib/messaging";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

export default function ChatInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("Chat");
  const [kind, setKind] = useState("");
  const [members, setMembers] = useState<
    { id: string; name: string; role: string }[]
  >([]);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!id || !user) return;
    let cancelled = false;
    async function load() {
      const [{ data: conv }, { data: parts }, { data: me }] = await Promise.all([
        supabase
          .from("conversations")
          .select("kind, subject")
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("conversation_participants")
          .select("user_id, role")
          .eq("conversation_id", id),
        supabase
          .from("conversation_participants")
          .select("muted")
          .eq("conversation_id", id)
          .eq("user_id", user!.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (conv) {
        setKind(conv.kind);
        setTitle(
          conversationTitle({ kind: conv.kind, subject: conv.subject }),
        );
      }
      setMuted(Boolean(me?.muted));

      const userIds = (parts || []).map((p) => p.user_id as string);
      const { data: profiles } = userIds.length
        ? await supabase
            .from("profiles")
            .select("id, preferred_name, first_name, full_name")
            .in("id", userIds)
        : { data: [] as { id: string; preferred_name: string | null; first_name: string | null; full_name: string | null }[] };

      const nameById = new Map(
        (profiles || []).map((p) => [
          p.id,
          p.preferred_name || p.first_name || p.full_name || "Member",
        ]),
      );

      setMembers(
        (parts || []).map((p) => ({
          id: p.user_id as string,
          name: nameById.get(p.user_id as string) || "Member",
          role: (p.role as string) || "member",
        })),
      );
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
          <Avatar label={title} size={88} />
          <AppText size={20} weight="700">
            {title}
          </AppText>
          <AppText muted>{kindLabel(kind)}</AppText>
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

        {(kind === "group" || members.length > 0) && (
          <>
            <AppText weight="700">Members · {members.length}</AppText>
            {members.map((m) => (
              <View
                key={m.id}
                style={[styles.row, { backgroundColor: colors.surface }]}
              >
                <Avatar label={m.name} size={36} />
                <View style={{ flex: 1 }}>
                  <AppText weight="600">{m.name}</AppText>
                  <AppText muted size={12}>
                    {m.role}
                  </AppText>
                </View>
              </View>
            ))}
          </>
        )}
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
