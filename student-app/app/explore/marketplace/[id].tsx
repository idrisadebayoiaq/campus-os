import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, EmptyState, Screen } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import { startBusinessChat, startDirectChat } from "@/src/lib/messaging";
import { distanceKm, formatDistance, loadSavedLocation } from "@/src/lib/location";
import { supabase } from "@/src/lib/supabase";
import { levelLabel, loadBizMeta, metaLine, trackEvent, type BizMeta } from "@/src/lib/trust";
import {
  isStudentVerified,
  verificationGateMessage,
} from "@/src/lib/verification";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";
import { MediaGallery, type GalleryItem } from "@/src/components/media-gallery";

type Listing = {
  id: string;
  title: string;
  description: string | null;
  kind: string | null;
  category: string | null;
  condition: string | null;
  price: number | null;
  image_url: string | null;
  seller_user_id: string | null;
  business_id: string | null;
  pickup_point_id: string | null;
};

export default function MarketplaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState<Listing | null>(null);
  const [media, setMedia] = useState<GalleryItem[]>([]);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [sellerName, setSellerName] = useState("Seller");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pickup, setPickup] = useState<string | null>(null);
  const [bizMeta, setBizMeta] = useState<BizMeta | null>(null);

  useEffect(() => {
    if (id && user) trackEvent(supabase, user.id, "view", "marketplace_listing", id);
  }, [id, user]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase
        .from("marketplace_listings")
        .select(
          "id, title, description, kind, category, condition, price, image_url, seller_user_id, business_id, pickup_point_id",
        )
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setItem(null);
        setLoading(false);
        return;
      }
      setItem(data as Listing);
      const { data: mediaRows } = await supabase
        .from("listing_media")
        .select("url, kind, is_cover, sort_order")
        .eq("market_listing_id", data.id)
        .order("is_cover", { ascending: false })
        .order("sort_order", { ascending: true });
      const gallery: GalleryItem[] = (mediaRows || [])
        .filter((m) => Boolean(m.url))
        .map((m) => ({ url: m.url as string, kind: m.kind === "video" ? "video" : "image" }));
      if (!gallery.length && data.image_url) gallery.push({ url: data.image_url, kind: "image" });
      if (!cancelled) setMedia(gallery);
      if (data.pickup_point_id) {
        const { data: pp } = await supabase.from("pickup_points").select("name, lat, lng").eq("id", data.pickup_point_id).maybeSingle();
        let walk = "";
        if (pp?.lat != null && pp?.lng != null && user) {
          const home = await loadSavedLocation(supabase, user.id);
          if (home) {
            const km = distanceKm(home, { lat: Number(pp.lat), lng: Number(pp.lng) });
            walk = ` · ${formatDistance(km)} from you, about ${Math.max(1, Math.round(km * 12))} min walk`;
          }
        }
        if (!cancelled) setPickup(pp?.name ? `${pp.name}${walk}` : null);
      }
      if (data.business_id) {
        const m = await loadBizMeta(supabase, [data.business_id]);
        if (!cancelled) setBizMeta(m[data.business_id] ?? null);
      }
      if (data.business_id) {
        const { data: biz } = await supabase
          .from("business_profiles")
          .select("display_name")
          .eq("id", data.business_id)
          .maybeSingle();
        if (biz?.display_name) setSellerName(biz.display_name);
      } else if (data.seller_user_id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("preferred_name, first_name, full_name")
          .eq("id", data.seller_user_id)
          .maybeSingle();
        setSellerName(
          prof?.preferred_name ||
            prof?.first_name ||
            prof?.full_name ||
            "Seller",
        );
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function onBuy() {
    if (!user || !item) {
      router.push("/(auth)/login");
      return;
    }
    const verified = await isStudentVerified(supabase, user.id);
    if (!verified) {
      setStatus(verificationGateMessage());
      router.push("/verify");
      return;
    }
    Alert.alert(
      "Buy with your wallet?",
      `${formatNaira(item.price)} will be taken from your wallet and held safely by CampusOS. The seller is paid only after you receive the item, and you can report a problem before that.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Pay and hold",
          onPress: async () => {
            setBusy(true);
            setStatus(null);
            const { error } = await supabase.rpc("market_place_order", { p_listing: item.id });
            setBusy(false);
            if (error) {
              if (error.message.includes("Not enough wallet")) {
                Alert.alert("Not enough in your wallet", "Add money to your wallet, then try again.", [
                  { text: "Later", style: "cancel" },
                  { text: "Add money", onPress: () => router.push("/wallet") },
                ]);
              } else {
                setStatus(error.message);
              }
              return;
            }
            router.push("/market-orders");
          },
        },
      ],
    );
  }

  async function onMessage() {
    if (!user || !item) {
      router.push("/(auth)/login");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const verified = await isStudentVerified(supabase, user.id);
      if (!verified) {
        setStatus(verificationGateMessage());
        router.push("/verify");
        return;
      }
      // Best-effort enquiry row for marketplace tracking
      const { data: enquiry } = await supabase
        .from("listing_enquiries")
        .insert({
          marketplace_listing_id: item.id,
          business_id: item.business_id,
          student_id: user.id,
          subject: item.title,
          message: `Hi — interested in ${item.title}.`,
        })
        .select("id")
        .maybeSingle();
      trackEvent(supabase, user.id, "start_chat", "marketplace_listing", item.id);

      let conversationId: string;
      if (item.business_id) {
        conversationId = await startBusinessChat(supabase, {
          studentId: user.id,
          businessId: item.business_id,
          subject: item.title,
          message: `Hi — interested in ${item.title}. Is it still available?`,
          listingEnquiryId: enquiry?.id ?? null,
        });
      } else if (item.seller_user_id) {
        conversationId = await startDirectChat(supabase, {
          userId: user.id,
          peerId: item.seller_user_id,
          firstMessage: `Hi — interested in ${item.title}. Is it still available?`,
        });
      } else {
        throw new Error("No seller to message");
      }
      router.push(`/inbox/${conversationId}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not message seller");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.fg} />
        </View>
      </Screen>
    );
  }

  if (!item) {
    return (
      <Screen>
        <EmptyState title="Not found" description="Listing unavailable." />
      </Screen>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.hero}>
          {media.length ? (
            <MediaGallery
              items={media}
              height={300}
              index={mediaIndex}
              onIndexChange={setMediaIndex}
              placeholderColor={colors.heroBg}
            />
          ) : (
            <View
              style={[
                styles.heroImg,
                {
                  backgroundColor: colors.heroBg,
                  alignItems: "center",
                  justifyContent: "center",
                },
              ]}
            >
              <Ionicons name="image-outline" size={40} color={colors.heroMuted} />
            </View>
          )}
          <Pressable
            onPress={() => router.back()}
            style={[styles.back, { top: insets.top + 8 }]}
          >
            <Ionicons name="arrow-back" size={18} color="#111" />
          </Pressable>
        </View>

        <View style={styles.body}>
          <AppText weight="700" size={22}>
            {formatNaira(item.price)}
          </AppText>
          <AppText size={18} weight="700">
            {item.title}
          </AppText>
          <View style={styles.chips}>
            {item.condition ? (
              <View style={[styles.chip, { backgroundColor: colors.surface }]}>
                <AppText size={12} weight="600">
                  {item.condition}
                </AppText>
              </View>
            ) : null}
            {item.category ? (
              <View style={[styles.chip, { backgroundColor: colors.surface }]}>
                <AppText size={12} weight="600">
                  {item.category}
                </AppText>
              </View>
            ) : null}
            {item.kind ? (
              <View style={[styles.chip, { backgroundColor: colors.surface }]}>
                <AppText size={12} weight="600">
                  {item.kind}
                </AppText>
              </View>
            ) : null}
          </View>
          <AppText muted size={13}>
            {sellerName}
            {bizMeta && levelLabel(bizMeta.level) ? ` · ${levelLabel(bizMeta.level)}` : ""}
            {bizMeta?.endorsed ? " · School-approved" : ""}
          </AppText>
          {bizMeta && metaLine(bizMeta) ? (
            <AppText size={12} weight="600">
              {metaLine(bizMeta)}
            </AppText>
          ) : null}
          {pickup ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="location-outline" size={15} color={colors.fg} />
              <AppText size={13} weight="600">
                Pickup point: {pickup}
              </AppText>
            </View>
          ) : null}
          {item.description ? (
            <AppText size={14} style={{ marginTop: 4 }}>
              {item.description}
            </AppText>
          ) : null}
          {status ? (
            <AppText size={13} style={{ color: colors.danger }}>
              {status}
            </AppText>
          ) : null}
          <Pressable
            onPress={() => router.push({ pathname: "/report", params: { type: "marketplace_listing", id: item.id, title: item.title } })}
            hitSlop={8}
            style={{ marginTop: 12 }}
          >
            <AppText size={13} muted>
              Report this listing
            </AppText>
          </Pressable>
        </View>
      </ScrollView>

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
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => void onMessage()}
            disabled={busy}
            style={[
              styles.msgBtn,
              {
                flex: 1,
                backgroundColor: Number(item.price) > 0 ? colors.surface : colors.inverseBg,
                opacity: busy ? 0.6 : 1,
              },
            ]}
          >
            <AppText weight="700" style={{ color: Number(item.price) > 0 ? colors.fg : colors.inverseFg }}>
              {busy ? "…" : "Message seller"}
            </AppText>
          </Pressable>
          {Number(item.price) > 0 && item.seller_user_id !== user?.id ? (
            <Pressable
              onPress={() => void onBuy()}
              disabled={busy}
              style={[styles.msgBtn, { flex: 1, backgroundColor: colors.inverseBg, opacity: busy ? 0.6 : 1 }]}
            >
              <AppText weight="700" style={{ color: colors.inverseFg }}>
                {busy ? "…" : "Buy with wallet"}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { height: 320 },
  heroImg: { width: "100%", height: "100%" },
  back: {
    position: "absolute",
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  body: { padding: 20, gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  msgBtn: {
    height: 52,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
