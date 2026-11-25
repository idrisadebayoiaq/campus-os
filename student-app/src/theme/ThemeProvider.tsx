import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Appearance, useColorScheme } from "react-native";
import { colorsFor, type ThemeColors } from "@/src/theme/tokens";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "campusos-theme";

type ThemeContextValue = {
  colors: ThemeColors;
  preference: ThemePreference;
  resolved: "light" | "dark";
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  colors: colorsFor("light"),
  preference: "system",
  resolved: "light",
  setPreference: () => undefined,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (!active) return;
      if (stored === "light" || stored === "dark" || stored === "system") {
        setPreferenceState(stored);
      }
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const resolved: "light" | "dark" =
    preference === "system"
      ? system === "dark"
        ? "dark"
        : "light"
      : preference;

  useEffect(() => {
    if (!ready) return;
    try {
      if (preference === "system") {
        Appearance.setColorScheme("unspecified" as never);
      } else {
        Appearance.setColorScheme(preference);
      }
    } catch {
      /* older runtimes */
    }
  }, [preference, ready]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: colorsFor(resolved),
      preference,
      resolved,
      setPreference,
    }),
    [resolved, preference, setPreference],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/** Colors only — most screens. */
export function useTheme() {
  return useContext(ThemeContext).colors;
}

/** Full theme controls (settings). */
export function useThemeControls() {
  return useContext(ThemeContext);
}
