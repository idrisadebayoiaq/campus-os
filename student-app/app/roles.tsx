import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Empty, PageShell, Pill, Section } from "@/src/components/page";
import { AppText, Button, Card, Field, Input } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { notify, toast } from "@/src/lib/feedback";
import { supabase } from "@/src/lib/supabase";

type Office = {
  id: string;
  title: string;
  scope: string;
  scope_label: string | null;
  status: "invited" | "active";
  term_ends_on: string | null;
};

type RepRole = {
  id: string;
  class_id: string;
  role: string;
  status: "invited" | "active";
  class_offerings: { course_code: string; course_title: string } | { course_code: string; course_title: string }[] | null;
};

function classOf(r: RepRole) {
  const c = Array.isArray(r.class_offerings) ? r.class_offerings[0] : r.class_offerings;
  return c ? `${c.course_code} · ${c.course_title}` : "Class";
}

function repLabel(role: string) {
  return role === "assistant_rep" ? "Assistant class rep" : "Class rep";
}

export default function RolesScreen() {
  const { user } = useAuth();
  const [offices, setOffices] = useState<Office[]>([]);
  const [reps, setReps] = useState<RepRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [composeFor, setComposeFor] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    const [o, r] = await Promise.all([
      supabase
        .from("student_offices")
        .select("id, title, scope, scope_label, status, term_ends_on")
        .eq("user_id", user.id)
        .in("status", ["invited", "active"])
        .order("created_at", { ascending: false }),
      supabase
        .from("class_staff")
        .select("id, class_id, role, status, class_offerings(course_code, course_title)")
        .eq("user_id", user.id)
        .in("role", ["class_rep", "assistant_rep"])
        .in("status", ["invited", "active"])
        .order("created_at", { ascending: false }),
    ]);
    setOffices((o.data as Office[] | null) ?? []);
    setReps((r.data as RepRole[] | null) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function respond(kind: "office" | "class_rep", id: string, accept: boolean) {
    setBusy(`${id}:${accept}`);
    const { error } = await supabase.rpc("respond_role_invite", { p_kind: kind, p_id: id, p_accept: accept });
    setBusy(null);
    if (error) return notify("Couldn't respond", error.message, undefined, { tone: "danger" });
    toast.success(accept ? "Role accepted" : "Invite declined");
    void load();
  }

  function stepDownOffice(o: Office) {
    notify(`Step down as ${o.title}?`, "Your school will be told and can appoint someone else.", [
      { text: "Stay", style: "cancel" },
      {
        text: "Step down",
        style: "destructive",
        onPress: () => {
          void (async () => {
            const { error } = await supabase.rpc("end_office", { p_office: o.id });
            if (error) return notify("Couldn't step down", error.message, undefined, { tone: "danger" });
            toast.success("You stepped down");
            void load();
          })();
        },
      },
    ]);
  }

  function stepDownRep(r: RepRole) {
    if (!user) return;
    notify("Step down as class rep?", "Your lecturer can appoint someone else.", [
      { text: "Stay", style: "cancel" },
      {
        text: "Step down",
        style: "destructive",
        onPress: () => {
          void (async () => {
            const { error } = await supabase.rpc("remove_class_rep", { p_class: r.class_id, p_user: user.id });
            if (error) return notify("Couldn't step down", error.message, undefined, { tone: "danger" });
            toast.success("You stepped down");
            void load();
          })();
        },
      },
    ]);
  }

  async function post(officeId: string) {
    if (!title.trim() || !body.trim()) return;
    setBusy(`post:${officeId}`);
    const { error } = await supabase.rpc("post_office_announcement", {
      p_office: officeId,
      p_title: title.trim(),
      p_body: body.trim(),
    });
    setBusy(null);
    if (error) return notify("Couldn't post", error.message, undefined, { tone: "danger" });
    setTitle("");
    setBody("");
    setComposeFor(null);
    toast.success("Announcement sent");
  }

  const invites = [
    ...offices.filter((o) => o.status === "invited").map((o) => ({ kind: "office" as const, id: o.id, title: o.title, detail: o.scope_label || "Whole school" })),
    ...reps.filter((r) => r.status === "invited").map((r) => ({ kind: "class_rep" as const, id: r.id, title: repLabel(r.role), detail: classOf(r) })),
  ];
  const activeOffices = offices.filter((o) => o.status === "active");
  const activeReps = reps.filter((r) => r.status === "active");

  return (
    <PageShell
      title="My roles"
      subtitle="Student leadership and class rep roles"
      loading={loading}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      {invites.length === 0 && activeOffices.length === 0 && activeReps.length === 0 ? (
        <Empty
          icon="ribbon-outline"
          title="No roles yet"
          body="When your school appoints you to an office or a lecturer makes you class rep, it shows up here."
        />
      ) : null}

      {invites.length > 0 ? (
        <Section title="Invitations" hint="Accept to get the badge and the tools that come with the role.">
          {invites.map((i) => (
            <Card key={i.id} style={{ gap: 10 }}>
              <View style={{ gap: 2 }}>
                <AppText weight="700">{i.title}</AppText>
                <AppText muted size={13}>
                  {i.detail}
                </AppText>
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Button title="Accept" onPress={() => void respond(i.kind, i.id, true)} loading={busy === `${i.id}:true`} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Decline"
                    variant="secondary"
                    onPress={() => void respond(i.kind, i.id, false)}
                    loading={busy === `${i.id}:false`}
                  />
                </View>
              </View>
            </Card>
          ))}
        </Section>
      ) : null}

      {activeOffices.length > 0 ? (
        <Section title="Offices" hint="Announcements reach the students in your office's area. Up to 3 a day.">
          {activeOffices.map((o) => (
            <Card key={o.id} style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <AppText weight="700" style={{ flex: 1 }}>
                  {o.title}
                </AppText>
                <Pill label={o.scope_label || "Whole school"} />
              </View>
              {o.term_ends_on ? (
                <AppText muted size={12}>
                  Term ends {new Date(o.term_ends_on).toLocaleDateString()}
                </AppText>
              ) : null}
              {composeFor === o.id ? (
                <>
                  <Field label="Title">
                    <Input value={title} onChangeText={setTitle} placeholder="e.g. SUG week starts Monday" maxLength={120} />
                  </Field>
                  <Field label="Message">
                    <Input
                      value={body}
                      onChangeText={setBody}
                      multiline
                      placeholder="What students need to know"
                      style={{ minHeight: 90, textAlignVertical: "top" }}
                    />
                  </Field>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Button
                        title="Send"
                        onPress={() => void post(o.id)}
                        loading={busy === `post:${o.id}`}
                        disabled={!title.trim() || !body.trim()}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button title="Cancel" variant="ghost" onPress={() => setComposeFor(null)} />
                    </View>
                  </View>
                </>
              ) : (
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Button title="Post announcement" compact onPress={() => setComposeFor(o.id)} />
                  </View>
                  <Button title="Step down" compact variant="ghost" onPress={() => stepDownOffice(o)} />
                </View>
              )}
            </Card>
          ))}
        </Section>
      ) : null}

      {activeReps.length > 0 ? (
        <Section title="Class rep" hint="Post to your class and take attendance from the class page.">
          {activeReps.map((r) => (
            <Card key={r.id} style={{ gap: 10 }}>
              <View style={{ gap: 2 }}>
                <AppText weight="700">{classOf(r)}</AppText>
                <AppText muted size={13}>
                  {repLabel(r.role)}
                </AppText>
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Open class"
                    compact
                    onPress={() => router.push({ pathname: "/study/class/[id]", params: { id: r.class_id } })}
                  />
                </View>
                <Button title="Step down" compact variant="ghost" onPress={() => stepDownRep(r)} />
              </View>
            </Card>
          ))}
        </Section>
      ) : null}
    </PageShell>
  );
}
