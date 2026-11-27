import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import {
  AppText,
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Input,
} from "@/src/components/ui";
import { DateTimeField } from "@/src/components/date-time-picker";
import { StudyShell, SyncBanner } from "@/src/components/study";
import { useAuth } from "@/src/lib/auth";
import { toast } from "@/src/lib/feedback";
import { supabase } from "@/src/lib/supabase";

type ClassRow = { id: string; course_code: string; course_title: string };

/** Mobile lecturer tools: publish assignments + schedule live classes. */
export default function LecturerAppHome() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState<Date | null>(null);
  const [liveTitle, setLiveTitle] = useState("");
  const [liveWhen, setLiveWhen] = useState<Date | null>(null);
  const [mode, setMode] = useState<"video" | "voice">("video");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const [{ data: roles, error: roleErr }, { data: profile, error: profErr }, { data: cls, error: clsErr }] =
        await Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", user.id),
          supabase
            .from("lecturer_profiles")
            .select("status")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase
            .from("class_offerings")
            .select("id, course_code, course_title")
            .eq("lecturer_user_id", user.id)
            .eq("is_active", true),
        ]);
      if (roleErr) throw roleErr;
      if (profErr) throw profErr;
      if (clsErr) throw clsErr;

      const ok =
        (roles || []).some((r) => r.role === "lecturer") ||
        profile?.status === "approved";
      setAllowed(Boolean(ok));
      const list = (cls as ClassRow[]) || [];
      setClasses(list);
      setClassId((prev) => prev || list[0]?.id || "");
    } catch (e) {
      setError(
        e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : "Could not load lecturer tools.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function publishAssignment() {
    if (!user || !classId || !title.trim()) return;
    setBusy(true);
    setError(null);
    const { data, error: insErr } = await supabase
      .from("class_assignments")
      .insert({
        class_id: classId,
        created_by: user.id,
        title: title.trim(),
        description: description.trim() || null,
        due_at: dueAt ? dueAt.toISOString() : null,
      })
      .select("id")
      .single();
    if (insErr || !data) {
      setBusy(false);
      setError(insErr?.message || "Failed to publish");
      return;
    }
    await supabase.rpc("push_assignment_to_student_tasks", {
      p_assignment_id: data.id,
    });
    setBusy(false);
    setTitle("");
    setDescription("");
    setDueAt(null);
    toast.success("Assignment published");
  }

  async function scheduleLive() {
    if (!user || !classId || !liveTitle.trim() || !liveWhen) return;
    setBusy(true);
    setError(null);
    const room = `campusos-${classId.slice(0, 8)}-${Date.now()}`;
    const webBase =
      process.env.EXPO_PUBLIC_STUDENT_WEB_URL ||
      "https://campusos-app.vercel.app";
    const joinUrl = `${webBase.replace(/\/$/, "")}/live/${encodeURIComponent(room)}?mode=${mode}`;
    const { error: liveErr } = await supabase.from("class_live_sessions").insert({
      class_id: classId,
      created_by: user.id,
      title: liveTitle.trim(),
      mode,
      scheduled_at: liveWhen.toISOString(),
      status: "scheduled",
      room_name: room,
      join_url: joinUrl,
    });
    setBusy(false);
    if (liveErr) {
      setError(liveErr.message);
      return;
    }
    setLiveTitle("");
    setLiveWhen(null);
    toast.success("Live class scheduled");
  }

  if (!loading && !allowed) {
    return (
      <StudyShell title="Lecturer tools" subtitle="Approval required">
        <EmptyState
          title="Not available yet"
          description="Available after your school authority approves your lecturer application on the portal."
        />
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </StudyShell>
    );
  }

  return (
    <StudyShell
      title="Lecturer tools"
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
      banner={<SyncBanner error={error} />}
    >

      {loading ? null : (
        <>
          <Card style={{ gap: 10 }}>
            <AppText weight="700">Class</AppText>
            {classes.length === 0 ? (
              <AppText muted size={13}>
                No classes yet — create one on the portal.
              </AppText>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {classes.map((c) => (
                  <Chip
                    key={c.id}
                    label={`${c.course_code}`}
                    active={classId === c.id}
                    onPress={() => setClassId(c.id)}
                  />
                ))}
              </View>
            )}
            {classId ? (
              <AppText muted size={12}>
                {classes.find((c) => c.id === classId)?.course_title}
              </AppText>
            ) : null}
          </Card>

          <Card style={{ gap: 12 }}>
            <AppText weight="700">New assignment</AppText>
            <Field label="Title">
              <Input value={title} onChangeText={setTitle} placeholder="Title" />
            </Field>
            <Field label="Description">
              <Input
                value={description}
                onChangeText={setDescription}
                placeholder="Description"
                multiline
                style={{ height: 88, paddingTop: 12, textAlignVertical: "top" }}
              />
            </Field>
            <DateTimeField label="Due (optional)" mode="datetime" value={dueAt} onChange={setDueAt} minimumDate={new Date()} placeholder="No due date" />
            <Button
              title="Publish assignment"
              onPress={publishAssignment}
              loading={busy}
              disabled={!classId}
            />
          </Card>

          <Card style={{ gap: 12 }}>
            <AppText weight="700">Schedule live class</AppText>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Chip
                label="Video"
                active={mode === "video"}
                onPress={() => setMode("video")}
              />
              <Chip
                label="Voice"
                active={mode === "voice"}
                onPress={() => setMode("voice")}
              />
            </View>
            <Field label="Session title">
              <Input
                value={liveTitle}
                onChangeText={setLiveTitle}
                placeholder="Session title"
              />
            </Field>
            <DateTimeField label="Starts" mode="datetime" value={liveWhen} onChange={setLiveWhen} minimumDate={new Date()} placeholder="Pick date and time" />
            <Button
              title="Schedule live"
              onPress={scheduleLive}
              loading={busy}
              disabled={!classId}
            />
          </Card>
        </>
      )}
    </StudyShell>
  );
}
