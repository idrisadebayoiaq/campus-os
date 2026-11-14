import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme/ThemeProvider";

export function Screen({
  children,
  style,
  padded = true,
  ...rest
}: ViewProps & { padded?: boolean }) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.flex,
        {
          backgroundColor: colors.bg,
          paddingTop: insets.top,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingHorizontal: padded ? 16 : 0,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

export function AppText({
  children,
  muted,
  size = 15,
  weight = "400",
  style,
}: {
  children: React.ReactNode;
  muted?: boolean;
  size?: number;
  weight?: "400" | "500" | "600" | "700";
  style?: object;
}) {
  const colors = useTheme();
  return (
    <Text
      style={[
        {
          color: muted ? colors.muted : colors.fg,
          fontSize: size,
          fontWeight: weight,
          lineHeight: size * 1.4,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
}: {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  loading?: boolean;
}) {
  const colors = useTheme();
  const bg =
    variant === "primary"
      ? colors.inverseBg
      : variant === "secondary"
        ? colors.bg
        : "transparent";
  const fg = variant === "primary" ? colors.inverseFg : colors.fg;
  const border = variant === "secondary" ? colors.border : "transparent";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: variant === "secondary" ? 1 : 0,
          opacity: disabled || loading ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ color: fg, fontSize: 15, fontWeight: "600" }}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Input(props: TextInputProps) {
  const colors = useTheme();
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      {...props}
      style={[
        styles.input,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
          color: colors.fg,
        },
        props.style,
      ]}
    />
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 6 }}>
      <AppText weight="500" size={14}>
        {label}
      </AppText>
      {children}
    </View>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const colors = useTheme();
  return (
    <View
      style={[
        styles.empty,
        { borderColor: colors.border, backgroundColor: colors.surface },
      ]}
    >
      <AppText weight="600">{title}</AppText>
      <AppText muted size={14} style={{ marginTop: 6, textAlign: "center" }}>
        {description}
      </AppText>
    </View>
  );
}

export function Card({ children, style }: ViewProps) {
  const colors = useTheme();
  return (
    <View
      style={[
        styles.card,
        { borderColor: colors.border, backgroundColor: colors.bg },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  button: {
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  empty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 36,
    alignItems: "center",
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
});
