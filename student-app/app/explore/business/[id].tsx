import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AppText,
  EmptyState,
  Screen,
} from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import { businessTypeLabel } from "@/src/lib/market-discovery";
import { startBusinessChat } from "@/src/lib/messaging";
import { supabase } from "@/src/lib/supabase";
import {
  isStudentVerified,
  verificationGateMessage,
} from "@/src/lib/verification";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type Biz = {
  id: string;
  display_name: string;
  business_type: string | null;
  bio: string | null;
  logo_url: string | null;
  cover_url: string | null;
  phone: string | null;
  whatsapp: string | null;
  show_phone_public: boolean | null;
  show_whatsapp_public: boolean | null;
  verification_label: string | null;
};

type MenuItem = {
  id: string;
  name: string;
  price: number | null;
  image_url: string | null;
  in_stock: boolean | null;
};

type Offer = {
  id: string;
  title: string;
  price: number | null;
  image_url: string | null;
};

export default function BusinessDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [biz, setBiz] = useState<Biz | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase
        .from("business_profiles")
        .select(
          "id, display_name, business_type, bio, logo_url, cover_url, phone, whatsapp, show_phone_public, show_whatsapp_public, verification_label",
        )
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setBiz(null);
        setLoading(false);
        return;
      }
      setBiz(data as Biz);

      if (data.business_type === "food_vendor") {
        const { data: items } = await supabase
          .from("menu_items")
          .select("id, name, price, image_url, in_stock")
          .eq("business_id", id)
          .eq("is_published", true)
          .order("name")
          .limit(40);
        if (!cancelled) setMenu((items as MenuItem[]) || []);
      } else {
        const { data: listings } = await supabase
          .from("marketplace_listings")
          .select("id, title, price, image_url")
          .eq("business_id", id)
          .eq("status", "active")
          .limit(40);
        if (!cancelled) {
          setOffers(
            ((listings || []) as { id: string; title: string; price: number | null; image_url: string | null }[]).map(
              (l) => ({
                id: l.id,
                title: l.title,
                price: l.price,
                image_url: l.image_url,
              }),
            ),
          );
        }
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function onMessage() {
    if (!user || !biz) {
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
      const conversationId = await startBusinessChat(supabase, {
        studentId: user.id,
        businessId: biz.id,
        subject: biz.display_name,
        message: `Hi — I'm interested in ${biz.display_name}.`,
      });
      router.push(`/inbox/${conversationId}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not start chat");
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

  if (!biz) {
    return (
      <Screen>
        <EmptyState title="Not found" description="This business is unavailable." />
      </Screen>
    );
  }

  const isFood = biz.business_type === "food_vendor";
  const cover = biz.cover_url || biz.logo_url;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.hero}>
          {cover ? (
            <Image source={{ uri: cover }} style={styles.heroImg} />
          ) : (
            <View style={[styles.heroImg, { backgroundColor: colors.heroBg }]} />
          )}
          <Pressable
            onPress={() => router.back()}
            style={[styles.back, { top: insets.top + 8 }]}
          >
            <Ionicons name="arrow-back" size={18} color="#111" />
          </Pressable>
        </View>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            {biz.logo_url ? (
              <Image source={{ uri: biz.logo_url }} style={styles.logo} />
            ) : (
              <View
                style={[
                  styles.logo,
                  {
                    backgroundColor: colors.accentSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  },
                ]}
              >
                <AppText weight="700">
                  {biz.display_name.slice(0, 1).toUpperCase()}
                </AppText>
              </View>
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <AppText size={22} weight="700" numberOfLines={2}>
                {biz.display_name}
              </AppText>
              <AppText muted size={13}>
                {businessTypeLabel(biz.business_type)}
                {biz.verification_label
                  ? ` · ${biz.verification_label.replaceAll("_", " ")}`
                  : ""}
              </AppText>
            </View>
          </View>

          <View style={styles.contactRow}>
            {biz.show_phone_public && biz.phone ? (
              <Pressable
                onPress={() => void Linking.openURL(`tel:${biz.phone}`)}
                style={[styles.contactBtn, { backgroundColor: colors.surface }]}
              >
                <Ionicons name="call-outline" size={18} color={colors.fg} />
                <AppText size={12} weight="600">
                  Call
                </AppText>
              </Pressable>
            ) : null}
            {biz.show_whatsapp_public && biz.whatsapp ? (
              <Pressable
                onPress={() =>
                  void Linking.openURL(
                    `https://wa.me/${biz.whatsapp!.replace(/[^\d]/g, "")}`,
                  )
                }
                style={[styles.contactBtn, { backgroundColor: colors.surface }]}
              >
                <Ionicons name="logo-whatsapp" size={18} color={colors.fg} />
                <AppText size={12} weight="600">
                  WhatsApp
                </AppText>
              </Pressable>
            ) : null}
          </View>

          <AppText weight="700" size={16}>
            {isFood ? "Menu" : "Available"}
          </AppText>

          {(isFood ? menu : offers).length === 0 ? (
            <AppText muted size={13}>
              Nothing listed yet
            </AppText>
          ) : isFood ? (
            menu.map((m) => (
              <View
                key={m.id}
                style={[styles.offerRow, { backgroundColor: colors.surface }]}
              >
                {m.image_url ? (
                  <Image source={{ uri: m.image_url }} style={styles.offerThumb} />
                ) : (
                  <View
                    style={[
                      styles.offerThumb,
                      { backgroundColor: colors.accentSoft },
                    ]}
                  />
                )}
                <AppText weight="600" style={{ flex: 1 }} numberOfLines={1}>
                  {m.name}
                </AppText>
                <AppText weight="700" size={13}>
                  {formatNaira(m.price)}
                </AppText>
              </View>
            ))
          ) : (
            offers.map((o) => (
              <Pressable
                key={o.id}
                onPress={() => router.push(`/explore/marketplace/${o.id}`)}
                style={[styles.offerRow, { backgroundColor: colors.surface }]}
              >
                {o.image_url ? (
                  <Image source={{ uri: o.image_url }} style={styles.offerThumb} />
                ) : (
                  <View
                    style={[
                      styles.offerThumb,
                      { backgroundColor: colors.accentSoft },
                    ]}
                  />
                )}
                <AppText weight="600" style={{ flex: 1 }} numberOfLines={1}>
                  {o.title}
                </AppText>
                <AppText weight="700" size={13}>
                  {formatNaira(o.price)}
                </AppText>
              </Pressable>
            ))
          )}

          {status ? (
            <AppText size={13} style={{ color: colors.danger }}>
              {status}
            </AppText>
          ) : null}
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
        <Pressable
          onPress={() => void onMessage()}
          disabled={busy}
          style={[
            styles.msgBtn,
            {
              backgroundColor: colors.inverseBg,
              opacity: busy ? 0.6 : 1,
            },
          ]}
        >
          <AppText weight="700" style={{ color: colors.inverseFg }}>
            {busy ? "…" : "Message"}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { height: 220 },
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
  body: { padding: 20, gap: 14 },
  titleRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  logo: { width: 56, height: 56, borderRadius: 16 },
  contactRow: { flexDirection: "row", gap: 8 },
  contactBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 40,
    borderRadius: radii.pill,
  },
  offerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: radii.md,
  },
  offerThumb: { width: 44, height: 44, borderRadius: 10 },
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
