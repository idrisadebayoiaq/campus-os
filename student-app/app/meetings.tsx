import { useCallback, useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { AppText, Button, EmptyState } from "@/src/components/ui";
import { Row, StudyShell, SyncBanner } from "@/src/components/study";
import { useAuth } from "@/src/lib/auth";
import { supabase } from "@/src/lib/supabase";

type Meeting = {
  id: string;
  title: string;
  mode: string;
  scheduled_at: string;
  status: string;
  room_name: string;
  lecturer_user_id: string;
};

export default function MeetingsScreen() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const { data, error: qErr } = await supabase
        .from("staff_student_meetings")
        .select(
          "id, title, mode, scheduled_at, status, room_name, lecturer_user_id",
        )
        .or(`student_user_id.eq.${user.id},lecturer_user_id.eq.${user.id}`)
        .neq("status", "cancelled")
        .order("scheduled_at", { ascending: true })
        .limit(40);
      if (qErr) throw qErr;
      setRows((data as Meeting[]) || []);
    } catch (e) {
      setError(
        e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : "Could not load meetings.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  function join(m: Meeting) {
    const webBase =
      process.env.EXPO_PUBLIC_STUDENT_WEB_URL ||
      "https://campusos-app.vercel.app";
    const url = `${webBase.replace(/\/$/, "")}/live/${encodeURIComponent(m.room_name)}?mode=${m.mode === "voice" ? "voice" : "video"}`;
    void Linking.openURL(url);
  }

  return (
    <StudyShell
      title="Meetings"
      subtitle="1:1 voice and video with lecturers"
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
      banner={<SyncBanner error={error} />}
    >
      {loading ? null : rows.length === 0 ? (
        <EmptyState
          title="No meetings"
          description="Lecturers schedule voice or video calls from the class roster."
        />
      ) : (
        <View style={{ gap: 10 }}>
          {rows.map((m) => (
            <View key={m.id} style={{ gap: 8 }}>
              <Row
                info={{
                  title: m.title,
                  subtitle: `${m.mode} · ${new Date(m.scheduled_at).toLocaleString()}`,
                  meta: m.status,
                }}
              />
              <Button
                title={`Join ${m.mode === "voice" ? "voice" : "video"}`}
                onPress={() => join(m)}
              />
            </View>
          ))}
        </View>
      )}
      {!loading ? (
        <AppText muted size={12}>
          Join opens the CampusOS live room in your browser.
        </AppText>
      ) : null}
    </StudyShell>
  );
}
