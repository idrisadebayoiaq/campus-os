import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AppText,
  Button,
  EmptyState,
  Input,
  Screen,
} from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { formatNaira, unitTotal } from "@/src/lib/campus";
import { startHousingChat } from "@/src/lib/messaging";
import { supabase } from "@/src/lib/supabase";
import {
  isStudentVerified,
  verificationGateMessage,
} from "@/src/lib/verification";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type DetailUnit = {
  id: string;
  title: string;
  unit_type: string;
  rent_base: number | null;
  fee_agent: number | null;
  fee_agreement: number | null;
  fee_caution: number | null;
  fee_service: number | null;
  rent_period: string | null;
  capacity: number | null;
  furnished: boolean | null;
  amenities: string[] | null;
  properties: PropertyRow | PropertyRow[] | null;
};

type PropertyRow = {
  id?: string;
  title: string;
  description: string | null;
  verification_label: string | null;
  business_id?: string | null;
  campus_areas:
    | { name?: string | null }
    | { name?: string | null }[]
    | null;
};

const SELECT_WITH_BUSINESS =
  "id, title, unit_type, rent_base, fee_agent, fee_agreement, fee_caution, fee_service, rent_period, capacity, furnished, amenities, properties(id, title, description, verification_label, business_id, campus_areas(name))";
const SELECT_NO_BUSINESS =
  "id, title, unit_type, rent_base, fee_agent, fee_agreement, fee_caution, fee_service, rent_period, capacity, furnished, amenities, properties(id, title, description, verification_label, campus_areas(name))";

const { width: SCREEN_W } = Dimensions.get("window");

function areaName(property: DetailUnit["properties"]) {
  const p = Array.isArray(property) ? property[0] : property;
  const areas = p?.campus_areas;
  if (Array.isArray(areas)) return areas[0]?.name || "Nearby";
  return areas?.name || "Nearby";
}

export default function HousingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [unit, setUnit] = useState<DetailUnit | null>(null);
  const [media, setMedia] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [descExpanded, setDescExpanded] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!id) return;
      let res = await supabase
        .from("property_units")
        .select(SELECT_WITH_BUSINESS)
        .eq("id", id)
        .maybeSingle();
      if (res.error) {
        res = await supabase
          .from("property_units")
          .select(SELECT_NO_BUSINESS)
          .eq("id", id)
          .maybeSingle();
      }
      if (cancelled) return;
      if (res.error) setError(res.error.message);
      const row = (res.data as unknown as DetailUnit) || null;
      setUnit(row);

      if (row) {
        const property = Array.isArray(row.properties)
          ? row.properties[0]
          : row.properties;
        const { data: mediaRows } = await supabase
          .from("listing_media")
          .select("url, unit_id, property_id, sort_order")
          .or(
            `unit_id.eq.${row.id}${property?.id ? `,property_id.eq.${property.id}` : ""}`,
          )
          .order("sort_order", { ascending: true });
        const urls = (mediaRows || [])
          .map((m) => m.url)
          .filter(Boolean) as string[];
        if (!cancelled) setMedia(urls);
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id || !user) {
      setSaved(false);
      return;
    }
    let cancelled = false;
    async function loadSaved() {
      const { data } = await supabase
        .from("saved_units")
        .select("unit_id")
        .eq("user_id", user!.id)
        .eq("unit_id", id)
        .maybeSingle();
      if (!cancelled) setSaved(Boolean(data));
    }
    void loadSaved();
    return () => {
      cancelled = true;
    };
  }, [id, user]);

  function requireAuth() {
    if (user) return true;
    router.push("/(auth)/login");
    return false;
  }

  function finish(error: { message: string } | null, okText: string) {
    setBusy(null);
    setActionStatus(
      error
        ? { kind: "error", text: error.message }
        : { kind: "ok", text: okText },
    );
    return !error;
  }

  async function toggleSave() {
    if (!requireAuth() || !user || !unit) return;
    setBusy("save");
    setActionStatus(null);
    if (saved) {
      const { error: e } = await supabase
        .from("saved_units")
        .delete()
        .eq("user_id", user.id)
        .eq("unit_id", unit.id);
      if (finish(e, "Removed from saved.")) setSaved(false);
      return;
    }
    const { error: e } = await supabase
      .from("saved_units")
      .upsert({ user_id: user.id, unit_id: unit.id });
    if (finish(e, "Saved to your list.")) setSaved(true);
  }

  async function onBook() {
    if (!requireAuth() || !user || !unit) return;
    setBusy("book");
    setActionStatus(null);
    const { error: e } = await supabase.from("inspection_requests").insert({
      unit_id: unit.id,
      student_id: user.id,
      message: "I would like to book / inspect this unit.",
      preferred_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    finish(
      e,
      "Booking request sent. The agent will confirm an inspection time.",
    );
  }

  async function onMessage() {
    if (!requireAuth() || !user || !unit) return;
    const verified = await isStudentVerified(supabase, user.id);
    if (!verified) {
      setActionStatus({ kind: "error", text: verificationGateMessage() });
      router.push("/verify");
      return;
    }
    const property = Array.isArray(unit.properties)
      ? unit.properties[0]
      : unit.properties;
    if (!property?.business_id) {
      setActionStatus({
        kind: "error",
        text: "This listing has no agent to message yet.",
      });
      return;
    }
    setBusy("message");
    setActionStatus(null);
    try {
      const conversationId = await startHousingChat(supabase, {
        studentId: user.id,
        unitId: unit.id,
        businessId: property.business_id,
        subject: `Housing: ${unit.title}`,
        message: `Hi — I'm interested in ${unit.title}. Is it still available?`,
      });
      setBusy(null);
      router.push(`/inbox/${conversationId}`);
    } catch (e) {
      finish(
        { message: e instanceof Error ? e.message : "Could not start chat." },
        "",
      );
    }
  }

  async function submitReport() {
    if (!requireAuth() || !user || !unit) return;
    const reason = reportReason.trim();
    if (!reason) return;
    setBusy("report");
    setActionStatus(null);
    const { error: e } = await supabase.from("reports").insert({
      reporter_id: user.id,
      entity_type: "property_unit",
      entity_id: unit.id,
      reason,
    });
    if (finish(e, "Report submitted. Your identity stays private.")) {
      setReportOpen(false);
      setReportReason("");
    }
  }

  const chips = useMemo(() => {
    if (!unit) return [];
    const list: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [];
    list.push({
      icon: "home-outline",
      label: (unit.unit_type || "room").replaceAll("_", " "),
    });
    if (unit.capacity) {
      list.push({ icon: "people-outline", label: `${unit.capacity} guests` });
    }
    if (unit.furnished != null) {
      list.push({
        icon: "bed-outline",
        label: unit.furnished ? "Furnished" : "Unfurnished",
      });
    }
    for (const a of (unit.amenities || []).slice(0, 4)) {
      list.push({ icon: "checkmark-circle-outline", label: a });
    }
    return list;
  }, [unit]);

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.fg} />
        </View>
      </Screen>
    );
  }

  if (!unit) {
    return (
      <Screen>
        <EmptyState
          title="Listing not found"
          description={error || "This unit may be unpublished."}
        />
      </Screen>
    );
  }

  const property = Array.isArray(unit.properties)
    ? unit.properties[0]
    : unit.properties;
  const total = unitTotal(unit);
  const hero = media[heroIndex] || media[0];
  const description =
    property?.description || "No description provided for this listing.";
  const shortDesc =
    description.length > 160 && !descExpanded
      ? `${description.slice(0, 160).trim()}…`
      : description;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          {hero ? (
            <Image source={{ uri: hero }} style={styles.heroImage} />
          ) : (
            <View
              style={[styles.heroImage, { backgroundColor: colors.heroBg }]}
            />
          )}
          <View style={[styles.heroActions, { paddingTop: insets.top + 8 }]}>
            <Pressable
              onPress={() => router.back()}
              style={styles.round}
            >
              <Ionicons name="arrow-back" size={18} color="#111" />
            </Pressable>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable onPress={toggleSave} style={styles.round}>
                <Ionicons
                  name={saved ? "heart" : "heart-outline"}
                  size={18}
                  color={saved ? colors.danger : "#111"}
                />
              </Pressable>
              <Pressable
                onPress={() =>
                  void Share.share({
                    message: `CampusOS housing: ${unit.title} — ${formatNaira(total)}`,
                  })
                }
                style={styles.round}
              >
                <Ionicons name="share-outline" size={18} color="#111" />
              </Pressable>
            </View>
          </View>
          {media.length > 1 ? (
            <View style={styles.dots}>
              {media.slice(0, 5).map((_, i) => (
                <Pressable
                  key={i}
                  onPress={() => setHeroIndex(i)}
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        i === heroIndex
                          ? "#fff"
                          : "rgba(255,255,255,0.45)",
                      width: i === heroIndex ? 18 : 6,
                    },
                  ]}
                />
              ))}
            </View>
          ) : null}
        </View>

        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.bg, marginTop: -28 },
          ]}
        >
          <View style={styles.titleRow}>
            <View style={{ flex: 1, gap: 4, paddingRight: 8 }}>
              <AppText size={22} weight="700">
                {property?.title || unit.title}
              </AppText>
              <AppText muted size={13}>
                {areaName(unit.properties)}
                {property?.verification_label
                  ? ` · ${property.verification_label.replaceAll("_", " ")}`
                  : ""}
              </AppText>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <AppText weight="700" size={16}>
                {formatNaira(unit.rent_base)}
              </AppText>
              <AppText muted size={12}>
                /{unit.rent_period || "term"}
              </AppText>
            </View>
          </View>

          {media.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10 }}
            >
              {media.slice(0, 8).map((url, i) => (
                <Pressable key={`${url}-${i}`} onPress={() => setHeroIndex(i)}>
                  <Image source={{ uri: url }} style={styles.thumb} />
                  {i === 7 && media.length > 8 ? (
                    <View style={styles.moreOverlay}>
                      <AppText
                        size={12}
                        weight="700"
                        style={{ color: "#fff" }}
                      >
                        +{media.length - 7}
                      </AppText>
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          {chips.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {chips.map((c) => (
                <View
                  key={c.label}
                  style={[styles.chip, { borderColor: colors.border }]}
                >
                  <Ionicons name={c.icon} size={14} color={colors.muted} />
                  <AppText size={12} muted>
                    {c.label}
                  </AppText>
                </View>
              ))}
            </ScrollView>
          ) : null}

          <View style={{ gap: 6 }}>
            <AppText weight="700" size={16}>
              Property details
            </AppText>
            <AppText muted size={14}>
              {shortDesc}
            </AppText>
            {description.length > 160 ? (
              <Pressable onPress={() => setDescExpanded((v) => !v)}>
                <AppText size={14} weight="600" style={{ color: colors.accent }}>
                  {descExpanded ? "Show less" : "Read more"}
                </AppText>
              </Pressable>
            ) : null}
          </View>

          <View style={[styles.panel, { backgroundColor: colors.surface }]}>
            <AppText weight="700" size={16}>
              Move-in costs
            </AppText>
            <FeeRow
              label="Base rent"
              value={`${formatNaira(unit.rent_base)} / ${unit.rent_period || "term"}`}
            />
            <FeeRow label="Agent" value={formatNaira(unit.fee_agent)} />
            <FeeRow label="Agreement" value={formatNaira(unit.fee_agreement)} />
            <FeeRow label="Caution" value={formatNaira(unit.fee_caution)} />
            <FeeRow label="Service" value={formatNaira(unit.fee_service)} />
            <FeeRow label="Total" value={formatNaira(total)} bold />
            <AppText muted size={12} style={{ marginTop: 4 }}>
              Inspect in person before paying. Rent may be settled off CampusOS.
            </AppText>
          </View>

          {actionStatus ? (
            <AppText
              size={13}
              style={{
                color:
                  actionStatus.kind === "ok" ? colors.success : colors.danger,
              }}
            >
              {actionStatus.text}
            </AppText>
          ) : null}

          <Button
            title="Report listing"
            variant="ghost"
            onPress={() => {
              if (requireAuth()) setReportOpen(true);
            }}
          />
        </View>
      </ScrollView>

      <Modal
        visible={reportOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setReportOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.bg }]}>
            <AppText weight="700" size={18}>
              Report this listing
            </AppText>
            <Input
              value={reportReason}
              onChangeText={setReportReason}
              placeholder="Reason"
              multiline
              style={{
                backgroundColor: colors.surface,
                height: 96,
                paddingTop: 14,
                textAlignVertical: "top",
              }}
            />
            <Button
              title="Submit report"
              onPress={submitReport}
              loading={busy === "report"}
              disabled={!reportReason.trim()}
            />
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => setReportOpen(false)}
            />
          </View>
        </View>
      </Modal>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(insets.bottom, 14),
            backgroundColor: colors.bg,
            borderTopColor: colors.border,
          },
        ]}
      >
        <View style={{ flex: 1 }}>
          <AppText weight="700" size={16}>
            {formatNaira(total)} total
          </AppText>
          <AppText muted size={12}>
            {unit.title} · {formatNaira(unit.rent_base)}/
            {unit.rent_period || "term"}
          </AppText>
        </View>
        <Pressable
          onPress={() => void onMessage()}
          disabled={busy === "message"}
          style={[
            styles.msgBtn,
            {
              borderColor: colors.border,
              opacity: busy === "message" ? 0.6 : 1,
            },
          ]}
        >
          <Ionicons name="chatbubble-outline" size={16} color={colors.fg} />
          <AppText weight="600" size={13}>
            Message
          </AppText>
        </Pressable>
        <Pressable
          onPress={() => void onBook()}
          disabled={busy === "book"}
          style={[
            styles.bookBtn,
            {
              backgroundColor: colors.inverseBg,
              opacity: busy === "book" ? 0.6 : 1,
            },
          ]}
        >
          <AppText weight="700" size={14} style={{ color: colors.inverseFg }}>
            {busy === "book" ? "…" : "Book"}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

function FeeRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <View style={styles.feeRow}>
      <AppText muted size={13}>
        {label}
      </AppText>
      <AppText weight={bold ? "700" : "500"} size={14}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: {
    width: SCREEN_W,
    height: 320,
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroActions: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  dots: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 22,
    gap: 18,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 14,
  },
  moreOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  panel: {
    borderRadius: radii.lg,
    padding: 16,
    gap: 10,
  },
  feeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    borderRadius: radii.xl,
    padding: 20,
    gap: 14,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  msgBtn: {
    height: 48,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bookBtn: {
    height: 48,
    paddingHorizontal: 22,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
