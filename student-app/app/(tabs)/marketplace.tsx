import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  AppText,
  Chip,
  EmptyState,
  Screen,
  SearchBar,
  TAB_BAR_CLEARANCE,
} from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { formatNaira, getStudentCampus } from "@/src/lib/campus";
import {
  BUSINESS_CHIPS,
  MARKETPLACE_CHIPS,
  filterBusinesses,
  filterListings,
  inferBusinessChipFromQuery,
  inferMarketplaceChipFromQuery,
  businessTypeLabel,
  type BusinessChip,
  type MarketMode,
  type MarketplaceChip,
} from "@/src/lib/market-discovery";
import { supabase } from "@/src/lib/supabase";
import { levelLabel, loadBizMeta, loadFeatured, metaLine, type BizMeta } from "@/src/lib/trust";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type BusinessRow = {
  id: string;
  display_name: string;
  business_type: string | null;
  bio: string | null;
  logo_url: string | null;
  cover_url: string | null;
  discovery_tags: string[] | null;
  verification_label: string | null;
};

type ListingRow = {
  id: string;
  title: string;
  kind: string | null;
  category: string | null;
  price: number | null;
  image_url: string | null;
  condition: string | null;
};

export default function MarketHubScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const params = useLocalSearchParams<{ mode?: string; chip?: string }>();

  const [mode, setMode] = useState<MarketMode>(
    params.mode === "marketplace" ? "marketplace" : "business",
  );
  const [query, setQuery] = useState("");
  const [bizChip, setBizChip] = useState<BusinessChip>(
    (params.chip as BusinessChip) || "all",
  );
  const [mktChip, setMktChip] = useState<MarketplaceChip>("all");
  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [meta, setMeta] = useState<Record<string, BizMeta>>({});
  const [featured, setFeatured] = useState<Set<string>>(new Set());
  const [onlyApproved, setOnlyApproved] = useState(false);
  const [onlyVerified, setOnlyVerified] = useState(false);

  // Deep-link: food explore → Business + Food chip
  useEffect(() => {
    if (params.mode === "business" && params.chip) {
      setMode("business");
      setBizChip(params.chip as BusinessChip);
    }
  }, [params.mode, params.chip]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const campus = await getStudentCampus(supabase, user.id);
      if (!campus) {
        setBusinesses([]);
        setListings([]);
        return;
      }

      const [bizRes, listRes] = await Promise.all([
        supabase
          .from("business_profiles")
          .select(
            "id, display_name, business_type, bio, logo_url, cover_url, discovery_tags, verification_label",
          )
          .eq("campus_id", campus.campusId)
          .eq("is_active", true)
          .eq("setup_complete", true)
          .in("business_type", [
            "food_vendor",
            "campus_service",
            "marketplace_seller",
          ])
          .order("display_name", { ascending: true })
          .limit(80),
        supabase
          .from("marketplace_listings")
          .select("id, title, kind, category, price, image_url, condition")
          .eq("campus_id", campus.campusId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(60),
      ]);

      const [feat, bizMeta] = await Promise.all([
        loadFeatured(supabase),
        loadBizMeta(
          supabase,
          ((bizRes.data as BusinessRow[]) || []).map((b) => b.id),
          { checkOpen: ((bizRes.data as BusinessRow[]) || []).filter((b) => b.business_type === "food_vendor").map((b) => b.id) },
        ),
      ]);
      setFeatured(feat);
      setMeta(bizMeta);
      if (!bizRes.error) setBusinesses((bizRes.data as BusinessRow[]) || []);
      if (!listRes.error) setListings((listRes.data as ListingRow[]) || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  // Intent search auto-selects chip
  useEffect(() => {
    if (mode === "business") {
      const intent = inferBusinessChipFromQuery(query);
      if (intent) setBizChip(intent);
    } else {
      const intent = inferMarketplaceChipFromQuery(query);
      if (intent) setMktChip(intent);
    }
  }, [query, mode]);

  const visibleBusinesses = useMemo(() => {
    const base = filterBusinesses(businesses, bizChip, query).filter((b) => {
      const m = meta[b.id];
      if (onlyApproved && !m?.endorsed) return false;
      if (onlyVerified && (!m || m.level === "basic")) return false;
      return true;
    });
    const rank = (b: BusinessRow) => (featured.has(`business:${b.id}`) ? 0 : 1) + (meta[b.id]?.open === false ? 2 : 0);
    return [...base].sort((a, b) => rank(a) - rank(b));
  }, [businesses, bizChip, query, meta, featured, onlyApproved, onlyVerified]);

  const visibleListings = useMemo(() => {
    const base = filterListings(listings, mktChip, query);
    return [...base].sort(
      (a, b) => Number(featured.has(`marketplace_listing:${b.id}`)) - Number(featured.has(`marketplace_listing:${a.id}`)),
    );
  }, [listings, mktChip, query, featured]);

  return (
    <Screen padded={false} tabClearance>
      <View style={styles.top}>
        <View style={[styles.segment, { backgroundColor: colors.surface }]}>
          <Pressable
            onPress={() => setMode("business")}
            style={[
              styles.segmentBtn,
              mode === "business" && {
                backgroundColor: colors.inverseBg,
              },
            ]}
          >
            <AppText
              size={13}
              weight="700"
              style={{
                color:
                  mode === "business" ? colors.inverseFg : colors.muted,
              }}
            >
              Business
            </AppText>
          </Pressable>
          <Pressable
            onPress={() => setMode("marketplace")}
            style={[
              styles.segmentBtn,
              mode === "marketplace" && {
                backgroundColor: colors.inverseBg,
              },
            ]}
          >
            <AppText
              size={13}
              weight="700"
              style={{
                color:
                  mode === "marketplace" ? colors.inverseFg : colors.muted,
              }}
            >
              Marketplace
            </AppText>
          </Pressable>
        </View>

        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder={
            mode === "business" ? "Search businesses…" : "Search items…"
          }
        />
      </View>

      <FlatList
        horizontal
        data={
          (mode === "business" ? BUSINESS_CHIPS : MARKETPLACE_CHIPS) as {
            key: string;
            label: string;
          }[]
        }
        keyExtractor={(item) => item.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={{ flexGrow: 0, marginBottom: 4 }}
        renderItem={({ item }) => {
          const active =
            mode === "business"
              ? bizChip === item.key
              : mktChip === item.key;
          return (
            <Chip
              label={item.label}
              active={active}
              onPress={() => {
                if (mode === "business") setBizChip(item.key as BusinessChip);
                else setMktChip(item.key as MarketplaceChip);
              }}
            />
          );
        }}
      />

      {mode === "business" ? (
        <View style={styles.filters}>
          <Chip label="School-approved" active={onlyApproved} onPress={() => setOnlyApproved((v) => !v)} />
          <Chip label="Verified" active={onlyVerified} onPress={() => setOnlyVerified((v) => !v)} />
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.fg} />
        </View>
      ) : mode === "business" ? (
        <FlatList
          key="business"
          data={visibleBusinesses}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: TAB_BAR_CLEARANCE,
            gap: 10,
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor={colors.fg}
            />
          }
          ListEmptyComponent={
            <EmptyState title="No businesses" description="Try another search." />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/explore/business/${item.id}`)}
              style={({ pressed }) => [
                styles.bizCard,
                {
                  backgroundColor: colors.surface,
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
            >
              <View style={styles.thumbWrap}>
                {item.logo_url || item.cover_url ? (
                  <Image
                    source={{ uri: (item.logo_url || item.cover_url)! }}
                    style={styles.thumb}
                  />
                ) : (
                  <View
                    style={[
                      styles.thumb,
                      {
                        backgroundColor: colors.accentSoft,
                        alignItems: "center",
                        justifyContent: "center",
                      },
                    ]}
                  >
                    <AppText weight="700" size={18}>
                      {item.display_name.slice(0, 1).toUpperCase()}
                    </AppText>
                  </View>
                )}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <AppText weight="700" size={15} numberOfLines={1} style={{ flexShrink: 1 }}>
                    {item.display_name}
                  </AppText>
                  {featured.has(`business:${item.id}`) ? (
                    <View style={[styles.tag, { backgroundColor: colors.accentSoft }]}>
                      <AppText size={10} weight="700">
                        Featured
                      </AppText>
                    </View>
                  ) : null}
                  {meta[item.id]?.open === true || meta[item.id]?.open === false ? (
                    <View style={[styles.tag, { backgroundColor: meta[item.id]?.open ? colors.accentSoft : colors.bg }]}>
                      <AppText size={10} weight="700" style={{ color: meta[item.id]?.open ? colors.success : colors.danger }}>
                        {meta[item.id]?.open ? "Open" : "Closed"}
                      </AppText>
                    </View>
                  ) : null}
                </View>
                <AppText muted size={12} numberOfLines={1}>
                  {businessTypeLabel(item.business_type)}
                  {item.verification_label
                    ? ` · ${item.verification_label.replaceAll("_", " ")}`
                    : ""}
                  {levelLabel(meta[item.id]?.level ?? "basic") ? ` · ${levelLabel(meta[item.id].level)}` : ""}
                  {meta[item.id]?.endorsed ? " · School-approved" : ""}
                </AppText>
                {metaLine(meta[item.id]) ? (
                  <AppText size={12} weight="600" numberOfLines={1}>
                    {metaLine(meta[item.id])}
                  </AppText>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          key="marketplace"
          data={visibleListings}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 10, paddingHorizontal: 16 }}
          contentContainerStyle={{
            paddingBottom: TAB_BAR_CLEARANCE,
            gap: 10,
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor={colors.fg}
            />
          }
          ListEmptyComponent={
            <EmptyState title="No listings" description="Try another search." />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/explore/marketplace/${item.id}`)}
              style={({ pressed }) => [
                styles.mktTile,
                {
                  backgroundColor: colors.surface,
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
            >
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={styles.mktImage} />
              ) : (
                <View
                  style={[
                    styles.mktImage,
                    {
                      backgroundColor: colors.heroBg,
                      alignItems: "center",
                      justifyContent: "center",
                    },
                  ]}
                >
                  <Ionicons name="image-outline" size={28} color={colors.heroMuted} />
                </View>
              )}
              <View style={styles.mktMeta}>
                <AppText weight="700" size={14} numberOfLines={1}>
                  {formatNaira(item.price)}
                </AppText>
                <AppText size={12} numberOfLines={1}>
                  {item.title}
                </AppText>
                {featured.has(`marketplace_listing:${item.id}`) ? (
                  <AppText size={10} weight="700" muted>
                    Featured
                  </AppText>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 16, paddingTop: 8, gap: 12, marginBottom: 8 },
  segment: {
    flexDirection: "row",
    borderRadius: radii.pill,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    height: 40,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  chips: { paddingHorizontal: 16, gap: 8 },
  filters: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.pill },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  bizCard: {
    borderRadius: radii.lg,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 88,
  },
  thumbWrap: {
    width: 68,
    height: 68,
    borderRadius: 16,
    overflow: "hidden",
  },
  thumb: { width: "100%", height: "100%" },
  mktTile: {
    flex: 1,
    borderRadius: radii.md,
    overflow: "hidden",
    maxWidth: "50%",
  },
  mktImage: {
    width: "100%",
    aspectRatio: 1,
  },
  mktMeta: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
});
