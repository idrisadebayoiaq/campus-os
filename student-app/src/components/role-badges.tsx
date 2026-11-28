import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { AppText } from "@/src/components/ui";
import { supabase } from "@/src/lib/supabase";
import { radii } from "@/src/theme/tokens";

export type RoleBadge = { kind: string; label: string; detail: string | null };

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  authority: "business-outline",
  office: "ribbon-outline",
  lecturer: "school-outline",
  class_rep: "people-outline",
  verified: "shield-checkmark",
};

/** School roles shown next to a person's name: officials, student leaders, lecturers and class reps. */
export function useRoleBadges(userId: string | null | undefined, refreshKey = 0) {
  const [badges, setBadges] = useState<RoleBadge[]>([]);
  useEffect(() => {
    if (!userId) {
      setBadges([]);
      return;
    }
    let cancelled = false;
    void supabase.rpc("profile_badges", { p_user: userId }).then(({ data }) => {
      if (!cancelled) setBadges((data as RoleBadge[] | null) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);
  return badges;
}

export function RoleBadges({
  badges,
  fg,
  bg,
  skipVerified,
  center,
}: {
  badges: RoleBadge[];
  fg: string;
  bg: string;
  skipVerified?: boolean;
  center?: boolean;
}) {
  const shown = badges.filter((b) => !(skipVerified && b.kind === "verified"));
  if (shown.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: center ? "center" : "flex-start" }}>
      {shown.map((b, i) => (
        <View
          key={`${b.kind}-${b.label}-${i}`}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            paddingHorizontal: 9,
            paddingVertical: 4,
            borderRadius: radii.pill,
            backgroundColor: bg,
            maxWidth: "100%",
          }}
        >
          <Ionicons name={ICONS[b.kind] ?? "ribbon-outline"} size={12} color={fg} />
          <AppText size={11} weight="700" numberOfLines={1} style={{ color: fg, flexShrink: 1 }}>
            {b.detail ? `${b.label} · ${b.detail}` : b.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}
