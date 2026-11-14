export type ThemeColors = {
  bg: string;
  fg: string;
  muted: string;
  border: string;
  surface: string;
  inverseBg: string;
  inverseFg: string;
  danger: string;
  success: string;
  warn: string;
};

export const light: ThemeColors = {
  bg: "#ffffff",
  fg: "#0a0a0a",
  muted: "#737373",
  border: "#e5e5e5",
  surface: "#f7f7f7",
  inverseBg: "#0a0a0a",
  inverseFg: "#ffffff",
  danger: "#b91c1c",
  success: "#15803d",
  warn: "#a16207",
};

export const dark: ThemeColors = {
  bg: "#0a0a0a",
  fg: "#fafafa",
  muted: "#a3a3a3",
  border: "#262626",
  surface: "#141414",
  inverseBg: "#fafafa",
  inverseFg: "#0a0a0a",
  danger: "#b91c1c",
  success: "#15803d",
  warn: "#a16207",
};

export function colorsFor(scheme: "light" | "dark" | null | undefined): ThemeColors {
  return scheme === "dark" ? dark : light;
}
