import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import { colorsFor, type ThemeColors } from "@/src/theme/tokens";

const ThemeContext = createContext<ThemeColors>(colorsFor("light"));

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const colors = useMemo(() => colorsFor(scheme), [scheme]);
  return (
    <ThemeContext.Provider value={colors}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
