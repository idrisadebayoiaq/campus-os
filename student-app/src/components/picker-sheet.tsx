import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, SearchBar } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

export type PickerItem = {
  id: string;
  label: string;
  /** Second line, e.g. "University · Ibadan · 3 km away" */
  sub?: string;
  /** Extra words that should match the search box but are not shown */
  keywords?: string;
};

/** Tap-to-open dropdown field. Shows the current choice, or a placeholder. */
export function DropdownField({
  label,
  value,
  placeholder,
  onPress,
  disabled,
}: {
  label: string;
  value?: string | null;
  placeholder: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const colors = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <AppText size={13} weight="600">
        {label}
      </AppText>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || placeholder}`}
        style={[
          styles.field,
          { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, opacity: disabled ? 0.55 : 1 },
        ]}
      >
        <AppText size={15} weight={value ? "600" : "400"} muted={!value} numberOfLines={1} style={{ flex: 1 }}>
          {value || placeholder}
        </AppText>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
    </View>
  );
}

/** Bottom-sheet list with search, used as a dropdown for long lists (schools, campuses). */
export function PickerSheet({
  visible,
  title,
  items,
  selectedId,
  searchable = true,
  searchPlaceholder = "Search…",
  emptyText = "Nothing matches your search.",
  header,
  maxItems = 80,
  searchItems,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  items: PickerItem[];
  /** When the student types, search this larger list instead of `items` (e.g. all schools, not just nearby) */
  searchItems?: PickerItem[];
  selectedId?: string | null;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Extra content above the list, e.g. a "show all schools" switch */
  header?: React.ReactNode;
  maxItems?: number;
  onSelect: (item: PickerItem) => void;
  onClose: () => void;
}) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    const list = tokens.length
      ? (searchItems ?? items).filter((i) => {
          const hay = `${i.label} ${i.sub ?? ""} ${i.keywords ?? ""}`.toLowerCase();
          return tokens.every((t) => hay.includes(t));
        })
      : items;
    return list.slice(0, maxItems);
  }, [items, searchItems, query, maxItems]);

  function close() {
    setQuery("");
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close" />
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.bg, paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <View style={[styles.grab, { backgroundColor: colors.border }]} />
          <View style={styles.titleRow}>
            <AppText size={18} weight="700" style={{ flex: 1 }}>
              {title}
            </AppText>
            <Pressable onPress={close} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.fg} />
            </Pressable>
          </View>
          {searchable ? (
            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <SearchBar value={query} onChangeText={setQuery} placeholder={searchPlaceholder} />
            </View>
          ) : null}
          {header}
          <FlatList
            data={shown}
            keyExtractor={(i) => i.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 6 }}
            ListEmptyComponent={
              <AppText muted size={14} style={{ textAlign: "center", paddingVertical: 24 }}>
                {emptyText}
              </AppText>
            }
            renderItem={({ item }) => {
              const on = item.id === selectedId;
              return (
                <Pressable
                  onPress={() => {
                    setQuery("");
                    onSelect(item);
                  }}
                  style={[
                    styles.row,
                    {
                      backgroundColor: on ? colors.accentSoft : colors.surface,
                      borderColor: on ? colors.accent : "transparent",
                    },
                  ]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText weight="600" size={15}>
                      {item.label}
                    </AppText>
                    {item.sub ? (
                      <AppText muted size={12} numberOfLines={2}>
                        {item.sub}
                      </AppText>
                    ) : null}
                  </View>
                  {on ? <Ionicons name="checkmark-circle" size={20} color={colors.accent} /> : null}
                </Pressable>
              );
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    minHeight: 50,
  },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    maxHeight: "82%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
  },
  grab: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, marginBottom: 8 },
  titleRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
