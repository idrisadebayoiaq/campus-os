import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { AppText, Button, Card, EmptyState, Field, Input } from "@/src/components/ui";
import { Row, StudyShell, SyncBanner } from "@/src/components/study";
import { useAuth } from "@/src/lib/auth";
import { notify, toast } from "@/src/lib/feedback";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type ClassRow = {
  id: string;
  course_code: string;
  course_title: string;
};

type Assignment = {
  id: string;
  title: string;
  description: string | null;
  due_at: string | null;
};

type LiveSession = {
  id: string;
  title: string;
  mode: string;
  scheduled_at: string;
  status: string;
  join_url: string | null;
  room_name: string;
};

export default function StudyClassesScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [live, setLive] = useState<LiveSession[]>([]);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const { data: enrollments, error: enrErr } = await supabase
        .from("class_enrollments")
        .select("class_id, class_offerings(id, course_code, course_title)")
        .eq("student_user_id", user.id)
        .eq("status", "active");
      if (enrErr) throw enrErr;

      const rows: ClassRow[] = [];
      const ids: string[] = [];
      for (const e of enrollments || []) {
        const c = Array.isArray(e.class_offerings)
          ? e.class_offerings[0]
          : e.class_offerings;
        if (!c?.id) continue;
        ids.push(c.id);
        rows.push({
          id: c.id,
          course_code: c.course_code,
          course_title: c.course_title,
        });
      }
      setClasses(rows);

      if (ids.length) {
        const [{ data: asg, error: asgErr }, { data: lives, error: liveErr }] =
          await Promise.all([
            supabase
              .from("class_assignments")
              .select("id, title, description, due_at")
              .in("class_id", ids)
              .order("due_at", { ascending: true })
              .limit(30),
            supabase
              .from("class_live_sessions")
              .select("id, title, mode, scheduled_at, status, join_url, room_name")
              .in("class_id", ids)
              .in("status", ["scheduled", "live"])
              .order("scheduled_at", { ascending: true })
              .limit(20),
          ]);
        if (asgErr) throw asgErr;
        if (liveErr) throw liveErr;
        setAssignments((asg as Assignment[]) || []);
        setLive((lives as LiveSession[]) || []);
      } else {
        setAssignments([]);
        setLive([]);
      }
    } catch (e) {
      setError(
        e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : "Could not load classes.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onJoin() {
    if (!joinCode.trim()) return;
    setJoining(true);
    const { error: joinErr } = await supabase.rpc("join_class_by_code", {
      p_code: joinCode.trim(),
    });
    setJoining(false);
    if (joinErr) {
      notify("Couldn't join", joinErr.message, undefined, { tone: "danger" });
      return;
    }
    setJoinCode("");
    toast.success("Joined class");
    void load();
  }

  function openLive(s: LiveSession) {
    const webBase =
      process.env.EXPO_PUBLIC_STUDENT_WEB_URL ||
      "https://campusos-app.vercel.app";
    const url =
      s.join_url ||
      `${webBase.replace(/\/$/, "")}/live/${encodeURIComponent(s.room_name)}?mode=${s.mode === "voice" ? "voice" : "video"}`;
    void Linking.openURL(url);
  }

  return (
    <StudyShell
      title="Classes"
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
      banner={<SyncBanner error={error} />}
    >
      <View
        style={{
          backgroundColor: colors.heroBg,
          borderRadius: radii.xl,
          padding: 20,
          gap: 8,
        }}
      >
        <AppText size={13} style={{ color: colors.heroMuted }}>
          Registered schools
        </AppText>
        <AppText size={18} weight="700" style={{ color: colors.heroFg }}>
          Auto-enroll into department classes
        </AppText>
        <AppText size={13} style={{ color: colors.heroMuted }}>
          Unregistered schools still work for all other CampusOS study tools.
        </AppText>
        <Pressable onPress={() => router.push("/meetings")} style={{ marginTop: 4 }}>
          <AppText size={14} weight="600" style={{ color: colors.heroFg }}>
            Upcoming 1:1 meetings →
          </AppText>
        </Pressable>
      </View>

      <Card style={{ gap: 12 }}>
        <AppText weight="700">Join with code</AppText>
        <Field label="Class code">
          <Input
            value={joinCode}
            onChangeText={setJoinCode}
            autoCapitalize="characters"
            placeholder="ABC123"
          />
        </Field>
        <Button title="Join class" onPress={onJoin} loading={joining} />
      </Card>

      {loading ? null : (
        <>
          <AppText weight="700" size={17}>
            Enrolled
          </AppText>
          {classes.length === 0 ? (
            <EmptyState
              title="No classes yet"
              description="Ask your lecturer for a join code, or wait for school auto-enrolment."
            />
          ) : (
            <View style={{ gap: 10 }}>
              {classes.map((c) => (
                <Row
                  key={c.id}
                  info={{
                    title: c.course_code,
                    subtitle: c.course_title,
                  }}
                />
              ))}
            </View>
          )}

          <AppText weight="700" size={17}>
            Live classes
          </AppText>
          {live.length === 0 ? (
            <Card>
              <AppText muted size={13}>
                No upcoming live sessions.
              </AppText>
            </Card>
          ) : (
            <View style={{ gap: 10 }}>
              {live.map((s) => (
                <Row
                  key={s.id}
                  info={{
                    title: s.title,
                    subtitle: `${s.mode} · ${new Date(s.scheduled_at).toLocaleString()}`,
                    meta: s.status,
                    onPress: () => openLive(s),
                  }}
                />
              ))}
            </View>
          )}

          <AppText weight="700" size={17}>
            Assignments
          </AppText>
          {assignments.length === 0 ? (
            <Card>
              <AppText muted size={13}>
                No class assignments yet. Lecturers publish from portal tools.
              </AppText>
            </Card>
          ) : (
            <View style={{ gap: 10 }}>
              {assignments.map((a) => (
                <Row
                  key={a.id}
                  info={{
                    title: a.title,
                    subtitle: a.description ?? undefined,
                    meta: a.due_at
                      ? `Due ${new Date(a.due_at).toLocaleString()}`
                      : undefined,
                  }}
                />
              ))}
            </View>
          )}

          <Button
            title="Open study assignments"
            variant="secondary"
            onPress={() => router.push("/study/assignments")}
          />
        </>
      )}
    </StudyShell>
  );
}
