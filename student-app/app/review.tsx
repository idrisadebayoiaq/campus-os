import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, EmptyState } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";
import { notify } from "@/src/lib/feedback";

type Target = { kind: "order" | "inspection" | "enquiry"; ref: string; business: string; name: string; label?: string };
type Reviewable = { kind: Target["kind"]; ref_id: string; business_id: string; business_name: string; label: string; happened_at: string };

export default function ReviewScreen() {
  const params = useLocalSearchParams<{ kind?: string; ref?: string; business?: string; name?: string }>();
  const { user } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<Reviewable[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<Target | null>(
    params.kind && params.ref && params.business ? { kind: params.kind as Target["kind"], ref: params.ref, business: params.business, name: params.name ?? "this business" } : null,
  );
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    void supabase.rpc("my_reviewable").then(({ data }) => {
      setList((data as Reviewable[]) ?? []);
      setLoading(false);
    });
  }, [user]);

  async function submit() {
    if (!target || rating < 1) return;
    setBusy(true);
    const { error } = await supabase.rpc("submit_review", {
      p_business: target.business,
      p_rating: rating,
      p_comment: comment.trim() || null,
      p_order: target.kind === "order" ? target.ref : null,
      p_inspection: target.kind === "inspection" ? target.ref : null,
      p_enquiry: target.kind === "enquiry" ? target.ref : null,
    });
    setBusy(false);
    if (error) {
      notify("Couldn't save review", error.message);
      return;
    }
    notify("Thanks for your review", "It helps other students choose well.", [
      {
        text: "OK",
        onPress: () => {
          setList((l) => l.filter((x) => x.ref_id !== target.ref));
          setTarget(null);
          setRating(0);
          setComment("");
          if (params.ref) router.back();
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.top}>
        <Pressable
          onPress={() => (target && !params.ref ? setTarget(null) : router.back())}
          style={[styles.back, { backgroundColor: colors.surface }]}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={20} color={colors.fg} />
        </Pressable>
        <AppText size={18} weight="700">
          {target ? "Rate your experience" : "Rate & review"}
        </AppText>
        <View style={{ width: 40 }} />
      </View>

      {target ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 100 }} keyboardShouldPersistTaps="handled">
          <AppText>
            How was <AppText weight="700">{target.name}</AppText>
            {target.label ? ` (${target.label})` : ""}?
          </AppText>
          <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setRating(n)} hitSlop={6} accessibilityLabel={`${n} stars`}>
                <Ionicons name={n <= rating ? "star" : "star-outline"} size={40} color={n <= rating ? "#f5a623" : colors.muted} />
              </Pressable>
            ))}
          </View>
          <TextInput
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={600}
            placeholder="Add a comment (optional)"
            placeholderTextColor={colors.muted}
            style={[styles.area, { color: colors.fg, borderColor: colors.border, backgroundColor: colors.surface }]}
          />
          <AppText size={12} muted>
            Only students who really ordered, viewed or enquired can leave a review, so ratings stay honest.
          </AppText>
        </ScrollView>
      ) : loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.fg} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
          {list.length === 0 ? (
            <EmptyState title="Nothing to review" description="After you collect an order, attend a viewing or finish an enquiry, you can rate it here." />
          ) : (
            list.map((r) => (
              <Pressable
                key={`${r.kind}:${r.ref_id}`}
                onPress={() => setTarget({ kind: r.kind, ref: r.ref_id, business: r.business_id, name: r.business_name, label: r.label })}
                style={[styles.row, { backgroundColor: colors.surface }]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText weight="700">{r.business_name}</AppText>
                  <AppText size={12} muted>
                    {r.label}
                  </AppText>
                </View>
                <Ionicons name="star-outline" size={20} color={colors.fg} />
              </Pressable>
            ))
          )}
        </ScrollView>
      )}

      {target ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14), backgroundColor: colors.bg, borderTopColor: colors.border }]}>
          <Pressable
            onPress={() => void submit()}
            disabled={busy || rating < 1}
            style={[styles.cta, { backgroundColor: colors.inverseBg, opacity: busy || rating < 1 ? 0.5 : 1 }]}
          >
            <AppText weight="700" style={{ color: colors.inverseFg }}>
              {busy ? "Saving…" : "Submit review"}
            </AppText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: radii.md },
  area: { minHeight: 110, borderWidth: 1, borderRadius: radii.md, padding: 12, fontSize: 14, textAlignVertical: "top" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  cta: { height: 52, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
});
