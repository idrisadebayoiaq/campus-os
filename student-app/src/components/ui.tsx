import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

/** Bottom padding so content clears the floating pill tab bar */
export const TAB_BAR_CLEARANCE = 96;

export function Screen({
  children,
  style,
  padded = true,
  tabClearance = false,
  keyboard = false,
  keyboardOffset,
  contentContainerStyle,
  ...rest
}: ViewProps & {
  padded?: boolean;
  tabClearance?: boolean;
  /** Wrap children so the keyboard never covers inputs */
  keyboard?: boolean;
  keyboardOffset?: number;
  contentContainerStyle?: object;
}) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const padBottom = tabClearance
    ? TAB_BAR_CLEARANCE + Math.max(insets.bottom, 8)
    : Math.max(insets.bottom, 8);
  const frameStyle = [
    styles.flex,
    {
      backgroundColor: colors.bg,
      paddingTop: insets.top + 8,
      paddingBottom: keyboard ? 0 : padBottom,
      paddingHorizontal: padded ? 20 : 0,
    },
    style,
  ];

  if (!keyboard) {
    return (
      <View style={frameStyle} {...rest}>
        {children}
      </View>
    );
  }

  return (
    <View style={frameStyle} {...rest}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={
          keyboardOffset ?? (Platform.OS === "ios" ? insets.top + 8 : 0)
        }
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            { flexGrow: 1, paddingBottom: padBottom + 24 },
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export function AppText({
  children,
  muted,
  size = 15,
  weight = "400",
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  muted?: boolean;
  size?: number;
  weight?: "400" | "500" | "600" | "700";
  style?: object;
  numberOfLines?: number;
}) {
  const colors = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          color: muted ? colors.muted : colors.fg,
          fontSize: size,
          fontWeight: weight,
          lineHeight: size * 1.35,
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
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  style?: object;
}) {
  const colors = useTheme();
  const bg =
    variant === "primary"
      ? colors.accent
      : variant === "secondary"
        ? colors.surface
        : "transparent";
  const fg = variant === "primary" ? colors.onAccent : colors.fg;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          opacity: disabled || loading ? 0.5 : pressed ? 0.88 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ color: fg, fontSize: 16, fontWeight: "600" }}>{title}</Text>
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
          backgroundColor: colors.surface,
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
    <View style={{ gap: 8 }}>
      <AppText weight="600" size={14}>
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
    <View style={[styles.empty, { backgroundColor: colors.surface }]}>
      <AppText weight="700" size={17}>
        {title}
      </AppText>
      <AppText muted size={14} style={{ marginTop: 8, textAlign: "center" }}>
        {description}
      </AppText>
    </View>
  );
}

export function Card({ children, style }: ViewProps) {
  const colors = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }, style]}>
      {children}
    </View>
  );
}

export function Avatar({
  label,
  size = 44,
  uri,
}: {
  label: string;
  size?: number;
  uri?: string | null;
}) {
  const colors = useTheme();
  const initials = label
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.surface,
        }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.accent,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: colors.onAccent,
          fontWeight: "700",
          fontSize: size * 0.32,
        }}
      >
        {initials || "C"}
      </Text>
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.accent : colors.surface,
        },
      ]}
    >
      <Text
        style={{
          color: active ? colors.onAccent : colors.muted,
          fontWeight: "600",
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: React.ReactNode;
}) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 8,
          marginTop: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: checked ? colors.accent : colors.bg,
          borderWidth: 1.5,
          borderColor: checked ? colors.accent : colors.muted,
        }}
      >
        {checked ? (
          <Text style={{ color: colors.onAccent, fontSize: 14, fontWeight: "800" }}>
            ✓
          </Text>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = "Search…",
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}) {
  const colors = useTheme();
  return (
    <View style={[styles.search, { backgroundColor: colors.surface }]}>
      <Text style={{ color: colors.muted, fontSize: 16 }}>⌕</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={{ flex: 1, color: colors.fg, fontSize: 15, paddingVertical: 0 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  button: {
    height: 54,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  input: {
    height: 52,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  empty: {
    borderRadius: radii.lg,
    paddingHorizontal: 24,
    paddingVertical: 40,
    alignItems: "center",
  },
  card: {
    borderRadius: radii.lg,
    padding: 16,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.pill,
  },
  search: {
    height: 52,
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});
