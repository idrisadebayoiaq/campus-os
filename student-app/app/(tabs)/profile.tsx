import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Group, ListRow } from "@/src/components/page";
import { AppText, Avatar, Screen, TAB_BAR_CLEARANCE } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { maskNaira, usePayAuth } from "@/src/lib/pay-auth";
import { formatNaira, getStudentCampus, type StudentCampus } from "@/src/lib/campus";
import { notify } from "@/src/lib/feedback";
import { usePremium } from "@/src/lib/premium-state";
import { useStudentKind } from "@/src/lib/student-kind";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type ProfileBits = {
  displayName: string;
  level: string;
  programme: string;
  avatarUrl: string | null;
  verified: boolean;
  pendingVerification: boolean;
};

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { hidden: balanceHidden } = usePayAuth();
  const { isExamPrep } = useStudentKind();
  const premium = usePremium();
  const colors = useTheme();
  const [campus, setCampus] = useState<StudentCampus | null>(null);
  const [bits, setBits] = useState<ProfileBits>({
    displayName: "",
    level: "",
    programme: "",
    avatarUrl: null,
    verified: false,
    pendingVerification: false,
  });
  const [balance, setBalance] = useState<number | null>(null);
  const [activeOrders, setActiveOrders] = useState(0);
  const [unread, setUnread] = useState(0);
  const [premiumDismissed, setPremiumDismissed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      void (async () => {
        const [profileRes, studentRes, campusRow, enrollRes, walletRes, ordersRes, notifRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("first_name, last_name, preferred_name, full_name, avatar_url")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("student_profiles")
            .select("academic_level, department_name, programme_name, verification_level")
            .eq("user_id", user.id)
            .maybeSingle(),
          getStudentCampus(supabase, user.id),
          supabase
            .from("student_enrollments")
            .select("verification_status")
            .eq("user_id", user.id)
            .eq("is_primary", true)
            .maybeSingle(),
          supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
          supabase
            .from("food_orders")
            .select("id", { count: "exact", head: true })
            .eq("student_id", user.id)
            .in("status", ["placed", "accepted", "preparing", "ready"]),
          supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("is_read", false),
        ]);
        if (cancelled) return;
        const p = profileRes.data;
        const s = studentRes.data;
        const name =
          p?.preferred_name?.trim() ||
          [p?.first_name?.trim(), p?.last_name?.trim()].filter(Boolean).join(" ") ||
          p?.full_name?.trim() ||
          "Student";
        const status = enrollRes.data?.verification_status as string | undefined;
        setBits({
          displayName: name,
          level: String(s?.academic_level ?? ""),
          programme: String(s?.programme_name || s?.department_name || ""),
          avatarUrl: p?.avatar_url ? `${p.avatar_url}${p.avatar_url.includes("?") ? "&" : "?"}t=${Date.now()}` : null,
          verified: status === "verified" || s?.verification_level === "verified",
          pendingVerification: status === "pending",
        });
        setCampus(campusRow);
        setBalance(walletRes.data ? Number(walletRes.data.balance ?? 0) : 0);
        setActiveOrders(ordersRes.count ?? 0);
        setUnread(notifRes.count ?? 0);
      })();
      return () => {
        cancelled = true;
      };
    }, [user]),
  );

  function onSignOut() {
    notify("Sign out?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  const studyLine = [bits.level ? `${bits.level.replace(/l$/i, "")}L` : null, bits.programme || null]
    .filter(Boolean)
    .join(" · ");
  const go = (href: Href) => () => router.push(href);

  return (
    <Screen padded={false} tabClearance>
      <ScrollView
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE, paddingHorizontal: 20, gap: 18 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <AppText size={26} weight="700" style={{ flex: 1 }}>
            Profile
          </AppText>
          <Pressable
            onPress={go("/settings")}
            style={[styles.iconBtn, { backgroundColor: colors.surface }]}
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={20} color={colors.fg} />
          </Pressable>
        </View>

        <Pressable
          onPress={go("/profile-edit")}
          style={({ pressed }) => [styles.card, { backgroundColor: colors.heroBg, opacity: pressed ? 0.92 : 1 }]}
        >
          <View>
            <Avatar label={bits.displayName || "?"} size={72} uri={bits.avatarUrl} />
            <View style={[styles.editDot, { backgroundColor: colors.accent, borderColor: colors.heroBg }]}>
              <Ionicons name="pencil" size={12} color={colors.onAccent} />
            </View>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <AppText size={20} weight="700" numberOfLines={1} style={{ color: colors.heroFg }}>
              {bits.displayName}
            </AppText>
            {studyLine ? (
              <AppText size={13} numberOfLines={1} style={{ color: colors.heroMuted }}>
                {studyLine}
              </AppText>
            ) : null}
            {campus ? (
              <AppText size={13} numberOfLines={1} style={{ color: colors.heroMuted }}>
                {campus.campusName}
              </AppText>
            ) : null}
            {!isExamPrep ? (
              <View style={[styles.pill, { backgroundColor: bits.verified ? "rgba(22,163,74,0.25)" : "rgba(255,255,255,0.12)" }]}>
                <Ionicons
                  name={bits.verified ? "shield-checkmark" : "shield-outline"}
                  size={12}
                  color={bits.verified ? "#4ade80" : colors.heroFg}
                />
                <AppText size={11} weight="700" style={{ color: bits.verified ? "#4ade80" : colors.heroFg }}>
                  {bits.verified ? "Verified student" : bits.pendingVerification ? "Verification pending" : "Not verified"}
                </AppText>
              </View>
            ) : null}
          </View>
        </Pressable>

        <View style={styles.tiles}>
          <Tile icon="wallet-outline" label="Wallet" value={balance == null ? "…" : maskNaira(balance, balanceHidden)} onPress={go("/wallet")} />
          <Tile icon="bag-handle-outline" label="Orders" value={activeOrders ? `${activeOrders} active` : "None active"} onPress={go("/orders")} />
          <Tile icon="notifications-outline" label="Alerts" value={unread ? `${unread} new` : "All read"} onPress={go("/notifications")} />
        </View>

        {!premium.loading && !premium.active && !premiumDismissed ? (
          <Pressable onPress={go("/premium")} style={[styles.premium, { backgroundColor: colors.accentSoft }]}>
            <View style={[styles.premiumIcon, { backgroundColor: colors.inverseBg }]}>
              <Ionicons name="diamond" size={18} color={colors.inverseFg} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText weight="700">Go Premium</AppText>
              <AppText muted size={12}>
                {isExamPrep ? "AI tutor and past questions" : "More AI tutor, lower fees"} · {formatNaira(premium.price)}/month
              </AppText>
            </View>
            <Pressable onPress={() => setPremiumDismissed(true)} hitSlop={10} accessibilityLabel="Hide">
              <Ionicons name="close" size={18} color={colors.muted} />
            </Pressable>
          </Pressable>
        ) : null}

        <MenuGroup title="Account">
          <ListRow icon="person-outline" title="Edit profile" onPress={go("/profile-edit")} />
          {isExamPrep ? (
            <ListRow icon="flag-outline" title="Exam goals" onPress={go("/exam-goals")} />
          ) : (
            <ListRow
              icon="shield-checkmark-outline"
              title="Student ID"
              value={bits.verified ? "Verified" : bits.pendingVerification ? "Pending" : "Verify"}
              valueTone={bits.verified ? "success" : bits.pendingVerification ? "warn" : "neutral"}
              onPress={go("/verify")}
            />
          )}
          <ListRow
            icon="diamond-outline"
            title="Premium"
            value={premium.active ? "Active" : undefined}
            valueTone="success"
            onPress={go("/premium")}
          />
        </MenuGroup>

        <MenuGroup title="Activity">
          <ListRow icon="receipt-outline" title="Transaction history" onPress={go("/transactions")} />
          <ListRow icon="card-outline" title="Payments" onPress={go("/payments")} />
          {!isExamPrep ? <ListRow icon="star-outline" title="Rate & review" onPress={go("/review")} /> : null}
        </MenuGroup>

        <MenuGroup title="More">
          <ListRow icon="sparkles-outline" title="AI tutor" onPress={go("/inbox/ai-profile")} />
          <ListRow icon="headset-outline" title="Help & support" onPress={go("/support")} />
        </MenuGroup>

        <Pressable
          onPress={onSignOut}
          style={({ pressed }) => [styles.signOut, { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 }]}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <AppText weight="700" style={{ color: colors.danger }}>
            Sign out
          </AppText>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function MenuGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <AppText muted size={12} weight="700" style={{ marginLeft: 4 }}>
        {title.toUpperCase()}
      </AppText>
      <Group>{children}</Group>
    </View>
  );
}

function Tile({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress: () => void;
}) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 }]}
    >
      <Ionicons name={icon} size={20} color={colors.fg} />
      <AppText size={12} muted weight="600" style={{ marginTop: 8 }}>
        {label}
      </AppText>
      <AppText size={14} weight="700" numberOfLines={1}>
        {value}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingTop: 4 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: radii.xl, padding: 18, flexDirection: "row", alignItems: "center", gap: 16 },
  editDot: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radii.pill,
    marginTop: 4,
  },
  tiles: { flexDirection: "row", gap: 10 },
  tile: { flex: 1, borderRadius: radii.md, padding: 14 },
  premium: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radii.lg, padding: 14 },
  premiumIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  signOut: {
    flexDirection: "row",
    gap: 8,
    height: 52,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
  },
});
