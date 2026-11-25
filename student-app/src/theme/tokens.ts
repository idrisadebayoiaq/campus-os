export type ThemeColors = {
  bg: string;
  fg: string;
  muted: string;
  border: string;
  surface: string;
  soft: string;
  inverseBg: string;
  inverseFg: string;
  danger: string;
  success: string;
  warn: string;
  tabBar: string;
  tabIcon: string;
  tabIconActive: string;
  heroBg: string;
  heroFg: string;
  heroMuted: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
};

export const radii = {
  sm: 14,
  md: 20,
  lg: 28,
  xl: 36,
  pill: 999,
} as const;

/**
 * Phantom wallet–inspired palette
 * Lavender Current #AB9FF2 · Midnight Amethyst #3C315B · Porcelain #FFFDF8 · Soft #E2DFFE
 */
export const light: ThemeColors = {
  bg: "#FFFDF8",
  fg: "#3C315B",
  muted: "#86848D",
  border: "#E9E8EA",
  surface: "#F5F2FF",
  soft: "#E2DFFE",
  inverseBg: "#3C315B",
  inverseFg: "#FFFDF8",
  danger: "#b91c1c",
  success: "#15803d",
  warn: "#a16207",
  tabBar: "#3C315B",
  tabIcon: "#B7A9D9",
  tabIconActive: "#FFFFFF",
  heroBg: "#3C315B",
  heroFg: "#FFFFFF",
  heroMuted: "rgba(255,255,255,0.72)",
  accent: "#AB9FF2",
  accentSoft: "#E2DFFE",
  onAccent: "#3C315B",
};

export const dark: ThemeColors = {
  bg: "#1A1428",
  fg: "#F5F2FF",
  muted: "#A39DB8",
  border: "#2F2744",
  surface: "#241C36",
  soft: "#2F2744",
  inverseBg: "#AB9FF2",
  inverseFg: "#3C315B",
  danger: "#f87171",
  success: "#4ade80",
  warn: "#fbbf24",
  tabBar: "#AB9FF2",
  tabIcon: "#5C4F7A",
  tabIconActive: "#3C315B",
  heroBg: "#2A2140",
  heroFg: "#FFFFFF",
  heroMuted: "rgba(255,255,255,0.72)",
  accent: "#AB9FF2",
  accentSoft: "#3C315B",
  onAccent: "#3C315B",
};

export function colorsFor(scheme: "light" | "dark" | null | undefined): ThemeColors {
  return scheme === "dark" ? dark : light;
}
