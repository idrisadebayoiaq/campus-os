import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Empty, Notice, PageShell, Panel, Pill, type Tone } from "@/src/components/page";
import { AppText, Button } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import { notify, toast } from "@/src/lib/feedback";
import { supabase } from "@/src/lib/supabase";

type Unit = { title: string; properties: { title: string } | { title: string }[] | null };
type Viewing = {
  id: string;
  status: string;
  preferred_at: string | null;
  provider_note: string | null;
  unit_id: string;
  created_at: string;
  property_units: Unit | Unit[] | null;
};
type Offer = {
  id: string;
  inspection_id: string;
  amount: number;
  rent_period: string | null;
  status: string;
  due_on: string | null;
};

const STATUS: Record<string, { label: string; tone: Tone }> = {
  requested: { label: "Waiting for the agent", tone: "warn" },
  accepted: { label: "Confirmed", tone: "success" },
  rescheduled: { label: "New time", tone: "warn" },
  declined: { label: "Declined", tone: "danger" },
  completed: { label: "Viewed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  no_show: { label: "Missed", tone: "danger" },
};

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function ViewingsScreen() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Viewing[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const [v, o, w] = await Promise.all([
      supabase
        .from("inspection_requests")
        .select("id, status, preferred_at, provider_note, unit_id, created_at, property_units(title, properties(title))")
        .eq("student_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("payment_requests")
        .select("id, inspection_id, amount, rent_period, status, due_on")
        .eq("student_id", user.id)
        .not("inspection_id", "is", null)
        .order("created_at", { ascending: false }),
      supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
    ]);
    setRows((v.data as unknown as Viewing[]) ?? []);
    setOffers((o.data as unknown as Offer[]) ?? []);
    setBalance(Number(w.data?.balance ?? 0));
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    void load();
    if (!user) return;
    const channel = supabase
      .channel(`viewings-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "inspection_requests", filter: `student_id=eq.${user.id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_requests", filter: `student_id=eq.${user.id}` }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, user]);

  function cancelBooking(v: Viewing) {
    notify("Cancel this booking?", "The agent will be told. You can book again any time.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel booking",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("inspection_requests").update({ status: "cancelled" }).eq("id", v.id);
          if (error) notify("Couldn't cancel", error.message, undefined, { tone: "danger" });
          else toast.success("Booking cancelled");
          void load();
        },
      },
    ]);
  }

  function pay(o: Offer, unitTitle: string) {
    if (balance < Number(o.amount)) {
      notify("Not enough in your wallet", `You need ${formatNaira(o.amount)} and have ${formatNaira(balance)}.`, [
        { text: "Later", style: "cancel" },
        { text: "Add money", onPress: () => router.push("/wallet") },
      ]);
      return;
    }
    notify(
      "Pay and move in?",
      `${formatNaira(o.amount)}${o.rent_period ? ` per ${o.rent_period}` : ""} for ${unitTitle} will be taken from your wallet and sent to the agent.`,
      [
        { text: "Not yet", style: "cancel" },
        {
          text: "Pay and move in",
          onPress: async () => {
            setBusy(o.id);
            const { error } = await supabase.rpc("pay_payment_request", { p_request: o.id });
            setBusy(null);
            if (error) {
              notify("Couldn't pay", error.message, undefined, { tone: "danger" });
              void load();
              return;
            }
            void load();
            router.push({ pathname: "/receipt", params: { kind: "request", id: o.id, fresh: "1" } });
          },
        },
      ],
    );
  }

  function decline(o: Offer) {
    notify("Not for me?", "The agent will be told and the room is released. You have not paid anything.", [
      { text: "Go back", style: "cancel" },
      {
        text: "Not for me",
        style: "destructive",
        onPress: async () => {
          setBusy(o.id);
          const { error } = await supabase.rpc("decline_payment_request", { p_request: o.id });
          setBusy(null);
          if (error) notify("Couldn't update", error.message, undefined, { tone: "danger" });
          else toast.success("Offer declined");
          void load();
        },
      },
    ]);
  }

  return (
    <PageShell
      title="My viewings"
      loading={loading}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      {!rows.length ? (
        <Empty
          icon="calendar-outline"
          title="No viewings yet"
          body="Book a room to see it before you pay."
          action={<Button compact title="Find a room" onPress={() => router.push("/housing")} style={{ marginTop: 8 }} />}
        />
      ) : null}

      {rows.map((v) => {
        const unit = Array.isArray(v.property_units) ? v.property_units[0] : v.property_units;
        const property = Array.isArray(unit?.properties) ? unit?.properties[0] : unit?.properties;
        const st = STATUS[v.status] ?? { label: v.status, tone: "neutral" as Tone };
        const offer = offers.find((o) => o.inspection_id === v.id);
        const open = v.status === "requested" || v.status === "accepted" || v.status === "rescheduled";
        const title = unit?.title ?? "Room";
        return (
          <Panel key={v.id}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText weight="700" size={16}>
                  {title}
                </AppText>
                <AppText muted size={13}>
                  {property?.title ?? "Property"}
                  {v.preferred_at ? ` · ${when(v.preferred_at)}` : ""}
                </AppText>
              </View>
              <Pill label={st.label} tone={st.tone} />
            </View>

            {v.provider_note ? (
              <AppText size={13}>
                <AppText weight="700" size={13}>
                  Agent:{" "}
                </AppText>
                {v.provider_note}
              </AppText>
            ) : null}

            {open ? <Button compact variant="secondary" title="Cancel booking" onPress={() => cancelBooking(v)} /> : null}

            {v.status === "completed" ? (
              !offer ? (
                <Notice icon="time-outline">Waiting for the agent to send you an offer. If you are not interested, there is nothing to pay.</Notice>
              ) : offer.status === "pending" ? (
                <View style={{ gap: 10 }}>
                  <View style={{ gap: 2 }}>
                    <AppText weight="700" size={22}>
                      {formatNaira(offer.amount)}
                      {offer.rent_period ? (
                        <AppText muted size={14}>{`  per ${offer.rent_period}`}</AppText>
                      ) : null}
                    </AppText>
                    <AppText muted size={12}>
                      Paid from your wallet and sent to the agent. {offer.due_on ? `Offer open until ${new Date(offer.due_on).toLocaleDateString()}.` : ""}
                    </AppText>
                  </View>
                  <Button title="Pay and move in" onPress={() => pay(offer, title)} loading={busy === offer.id} />
                  <Button variant="secondary" title="Not for me" onPress={() => decline(offer)} disabled={busy === offer.id} />
                </View>
              ) : offer.status === "paid" ? (
                <View style={{ gap: 8 }}>
                  <Pill label="You moved in" tone="success" />
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Button compact title="My apartment" onPress={() => router.push("/apartment")} style={{ flex: 1 }} />
                    <Button
                      compact
                      variant="secondary"
                      title="Receipt"
                      onPress={() => router.push({ pathname: "/receipt", params: { kind: "request", id: offer.id } })}
                      style={{ flex: 1 }}
                    />
                  </View>
                </View>
              ) : (
                <AppText muted size={13}>
                  {offer.status === "declined" ? "You chose not to take this offer." : "This offer is no longer open."}
                </AppText>
              )
            ) : null}
          </Panel>
        );
      })}
    </PageShell>
  );
}
