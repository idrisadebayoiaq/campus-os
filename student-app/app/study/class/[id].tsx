import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { StudyShell, SyncBanner } from "@/src/components/study";
import { AppText, Avatar, Button, Card, Field, Input } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { notify, toast } from "@/src/lib/feedback";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type Rep = { user_id: string; role: string; name: string; avatar_url: string | null };
type Announcement = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  author_role: string;
  author: string;
};
type Overview = {
  id: string;
  course_code: string;
  course_title: string;
  level: string | null;
  semester: string | null;
  academic_session: string | null;
  department: string | null;
  lecturer: string | null;
  enrolled: number;
  my_role: "lecturer" | "rep" | "student";
  reps: Rep[];
  my_invite: { id: string; role: string } | null;
  announcements: Announcement[];
};
type OpenAttendance = { session_id: string; label: string | null; closes_at: string; marked: boolean };
type LiveCode = { code: string; seconds_left: number; present: number; enrolled: number; closes_at: string };

const MARK_MESSAGES: Record<string, string> = {
  wrong: "That code is wrong. Codes change every 30 seconds, so check the latest one.",
  locked: "Too many wrong tries. Ask your class rep or lecturer to mark you.",
  closed: "Attendance has closed for this class.",
};

function roleLabel(role: string) {
  return role === "assistant_rep" ? "Assistant rep" : "Class rep";
}

function minutesLeft(closesAt: string) {
  return Math.max(0, Math.ceil((new Date(closesAt).getTime() - Date.now()) / 60000));
}

export default function ClassScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const classId = String(id || "");
  const { user } = useAuth();
  const colors = useTheme();
  const [info, setInfo] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<OpenAttendance | null>(null);
  const [live, setLive] = useState<LiveCode | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [composing, setComposing] = useState(false);
  const fetchedAt = useRef(0);

  const canRun = info?.my_role === "lecturer" || info?.my_role === "rep";

  const load = useCallback(async () => {
    if (!classId) return;
    setError(null);
    const [{ data, error: err }, { data: att }] = await Promise.all([
      supabase.rpc("class_overview", { p_class: classId }),
      supabase.rpc("class_open_attendance", { p_class: classId }),
    ]);
    if (err) setError(err.message);
    else setInfo(data as Overview);
    const row = (att as OpenAttendance[] | null)?.[0] ?? null;
    setOpen(row);
    if (!row) setLive(null);
    setRefreshing(false);
  }, [classId]);

  useEffect(() => {
    void load();
  }, [load]);

  const fetchCode = useCallback(async (sessionId: string) => {
    const { data, error: err } = await supabase.rpc("attendance_code", { p_session: sessionId });
    if (err) return;
    const row = (data as LiveCode[] | null)?.[0];
    if (!row) return;
    fetchedAt.current = Date.now();
    setLive(row);
    if (new Date(row.closes_at).getTime() <= Date.now()) {
      setOpen(null);
      setLive(null);
    }
  }, []);

  // The code rotates every 30 seconds; refresh it (and the head count) while it is on screen.
  useEffect(() => {
    if (!canRun || !open) return;
    void fetchCode(open.session_id);
    const t = setInterval(() => void fetchCode(open.session_id), 4000);
    return () => clearInterval(t);
  }, [canRun, open, fetchCode]);

  const [, setTick] = useState(0);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [live]);
  const secondsLeft = live
    ? Math.max(0, live.seconds_left - Math.floor((Date.now() - fetchedAt.current) / 1000))
    : 0;

  async function respondInvite(accept: boolean) {
    if (!info?.my_invite) return;
    setBusy("invite");
    const { error: err } = await supabase.rpc("respond_role_invite", {
      p_kind: "class_rep",
      p_id: info.my_invite.id,
      p_accept: accept,
    });
    setBusy(null);
    if (err) return notify("Couldn't respond", err.message, undefined, { tone: "danger" });
    toast.success(accept ? "You're now a class rep" : "Invite declined");
    void load();
  }

  async function startAttendance() {
    setBusy("start");
    const { error: err } = await supabase.rpc("open_code_attendance", {
      p_class: classId,
      p_minutes: 10,
      p_label: null,
    });
    setBusy(null);
    if (err) return notify("Couldn't start attendance", err.message, undefined, { tone: "danger" });
    void load();
  }

  function closeAttendance() {
    if (!open) return;
    notify("Close attendance?", "Everyone who hasn't marked will be recorded as absent.", [
      { text: "Keep open", style: "cancel" },
      {
        text: "Close",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setBusy("close");
            const { data, error: err } = await supabase.rpc("close_attendance", { p_session: open.session_id });
            setBusy(null);
            if (err) return notify("Couldn't close", err.message, undefined, { tone: "danger" });
            toast.success(`Attendance closed · ${Number(data ?? 0)} marked absent`);
            void load();
          })();
        },
      },
    ]);
  }

  async function markPresent() {
    if (code.replace(/\D/g, "").length !== 6) return;
    setBusy("mark");
    const { data, error: err } = await supabase.rpc("mark_attendance_with_code", { p_class: classId, p_code: code });
    setBusy(null);
    if (err) return notify("Couldn't mark attendance", err.message, undefined, { tone: "danger" });
    const result = String(data);
    if (result === "ok" || result === "already") {
      setCode("");
      toast.success(result === "ok" ? "You're marked present" : "You were already marked present");
      void load();
      return;
    }
    notify("Not marked", MARK_MESSAGES[result] ?? "Try again.", undefined, { tone: "danger" });
    if (result === "closed") void load();
  }

  async function post() {
    if (!title.trim() || !body.trim()) return;
    setBusy("post");
    const { error: err } = await supabase.rpc("publish_class_announcement", {
      p_class_id: classId,
      p_title: title.trim(),
      p_body: body.trim(),
    });
    setBusy(null);
    if (err) return notify("Couldn't post", err.message, undefined, { tone: "danger" });
    setTitle("");
    setBody("");
    setComposing(false);
    toast.success("Announcement sent to the class");
    void load();
  }

  function stepDown() {
    if (!user) return;
    notify("Step down as class rep?", "Your lecturer can appoint someone else.", [
      { text: "Stay", style: "cancel" },
      {
        text: "Step down",
        style: "destructive",
        onPress: () => {
          void (async () => {
            const { error: err } = await supabase.rpc("remove_class_rep", { p_class: classId, p_user: user.id });
            if (err) return notify("Couldn't step down", err.message, undefined, { tone: "danger" });
            toast.success("You stepped down");
            void load();
          })();
        },
      },
    ]);
  }

  const meta = info
    ? [info.department, info.level ? `${info.level} level` : null, info.semester, info.academic_session]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <StudyShell
      title={info?.course_code ?? "Class"}
      subtitle={info?.course_title}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
      banner={<SyncBanner error={error} />}
    >
      {info ? (
        <>
          <View style={{ backgroundColor: colors.heroBg, borderRadius: radii.xl, padding: 20, gap: 6 }}>
            {meta ? (
              <AppText size={13} style={{ color: colors.heroMuted }}>
                {meta}
              </AppText>
            ) : null}
            <AppText size={18} weight="700" style={{ color: colors.heroFg }}>
              {info.course_title}
            </AppText>
            <AppText size={13} style={{ color: colors.heroMuted }}>
              {[info.lecturer ? `Lecturer: ${info.lecturer}` : null, `${info.enrolled} student${info.enrolled === 1 ? "" : "s"}`]
                .filter(Boolean)
                .join(" · ")}
            </AppText>
            {info.my_role !== "student" ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                <Ionicons name="ribbon-outline" size={14} color={colors.heroFg} />
                <AppText size={13} weight="700" style={{ color: colors.heroFg }}>
                  {info.my_role === "lecturer" ? "You teach this class" : "You're a class rep"}
                </AppText>
              </View>
            ) : null}
          </View>

          {info.my_invite ? (
            <Card style={{ gap: 10 }}>
              <AppText weight="700">You've been chosen as {roleLabel(info.my_invite.role).toLowerCase()}</AppText>
              <AppText muted size={13}>
                Reps post announcements to the class and take attendance with a code. You can step down any time.
              </AppText>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Button title="Accept" onPress={() => void respondInvite(true)} loading={busy === "invite"} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title="Decline" variant="secondary" onPress={() => void respondInvite(false)} />
                </View>
              </View>
            </Card>
          ) : null}

          <AppText weight="700" size={17}>
            Attendance
          </AppText>
          {canRun ? (
            open && live ? (
              <Card style={{ gap: 12, alignItems: "center" }}>
                <AppText muted size={13}>
                  Read this code out. It changes in {secondsLeft}s.
                </AppText>
                <AppText size={44} weight="700" style={{ letterSpacing: 8 }}>
                  {live.code}
                </AppText>
                <View style={{ width: "100%", height: 6, borderRadius: 3, backgroundColor: colors.accentSoft }}>
                  <View
                    style={{
                      width: `${Math.round((secondsLeft / 30) * 100)}%`,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: colors.accent,
                    }}
                  />
                </View>
                <AppText size={14} weight="600">
                  {live.present} of {live.enrolled} present · closes in {minutesLeft(live.closes_at)} min
                </AppText>
                <Button title="Close attendance" variant="secondary" onPress={closeAttendance} loading={busy === "close"} />
              </Card>
            ) : open ? (
              <Card>
                <AppText muted size={13}>
                  Loading the code…
                </AppText>
              </Card>
            ) : (
              <Card style={{ gap: 10 }}>
                <AppText muted size={13}>
                  Start attendance and read out the 6-digit code. Students type it in the app; it changes every 30
                  seconds so it can't be shared outside the room.
                </AppText>
                <Button title="Take attendance (10 min)" onPress={() => void startAttendance()} loading={busy === "start"} />
              </Card>
            )
          ) : open ? (
            open.marked ? (
              <Card style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                <AppText weight="600">You're marked present</AppText>
              </Card>
            ) : (
              <Card style={{ gap: 10 }}>
                <AppText weight="700">Attendance is open · {minutesLeft(open.closes_at)} min left</AppText>
                <Field label="Code from your rep or lecturer">
                  <Input
                    value={code}
                    onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
                    keyboardType="number-pad"
                    placeholder="000000"
                    maxLength={6}
                  />
                </Field>
                <Button
                  title="I'm here"
                  onPress={() => void markPresent()}
                  loading={busy === "mark"}
                  disabled={code.length !== 6}
                />
              </Card>
            )
          ) : (
            <Card>
              <AppText muted size={13}>
                No attendance is open right now.
              </AppText>
            </Card>
          )}

          <AppText weight="700" size={17}>
            Class reps
          </AppText>
          <Card style={{ gap: 12 }}>
            {info.reps.length === 0 ? (
              <AppText muted size={13}>
                No class rep yet. Your lecturer appoints one.
              </AppText>
            ) : (
              info.reps.map((r) => (
                <View key={r.user_id} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Avatar label={r.name} uri={r.avatar_url} size={36} />
                  <View style={{ flex: 1 }}>
                    <AppText weight="600">{r.user_id === user?.id ? `${r.name} (you)` : r.name}</AppText>
                    <AppText muted size={12}>
                      {roleLabel(r.role)}
                    </AppText>
                  </View>
                </View>
              ))
            )}
            {info.my_role === "rep" ? <Button title="Step down" variant="ghost" compact onPress={stepDown} /> : null}
          </Card>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <AppText weight="700" size={17}>
              Announcements
            </AppText>
            {canRun && !composing ? (
              <Button title="New" compact variant="secondary" onPress={() => setComposing(true)} />
            ) : null}
          </View>
          {composing ? (
            <Card style={{ gap: 10 }}>
              <Field label="Title">
                <Input value={title} onChangeText={setTitle} placeholder="e.g. Test moved to Friday" maxLength={120} />
              </Field>
              <Field label="Message">
                <Input
                  value={body}
                  onChangeText={setBody}
                  placeholder="Everyone in the class gets a notification."
                  multiline
                  style={{ minHeight: 90, textAlignVertical: "top" }}
                />
              </Field>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Post"
                    onPress={() => void post()}
                    loading={busy === "post"}
                    disabled={!title.trim() || !body.trim()}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title="Cancel" variant="ghost" onPress={() => setComposing(false)} />
                </View>
              </View>
            </Card>
          ) : null}
          {info.announcements.length === 0 ? (
            <Card>
              <AppText muted size={13}>
                No announcements yet.
              </AppText>
            </Card>
          ) : (
            info.announcements.map((a) => (
              <Card key={a.id} style={{ gap: 6 }}>
                <AppText weight="700">{a.title}</AppText>
                <AppText size={14}>{a.body}</AppText>
                <AppText muted size={12}>
                  {a.author}
                  {a.author_role === "lecturer" ? " · Lecturer" : ` · ${roleLabel(a.author_role)}`} ·{" "}
                  {new Date(a.created_at).toLocaleString()}
                </AppText>
              </Card>
            ))
          )}
        </>
      ) : error ? (
        <Button title="Back to classes" variant="secondary" onPress={() => router.replace("/study/classes")} />
      ) : null}
    </StudyShell>
  );
}
