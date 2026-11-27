import { useMemo, useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AppText,
  Button,
  Chip,
  Field,
  Input,
  Screen,
  SearchBar,
} from "@/src/components/ui";
import { Empty } from "@/src/components/page";
import {
  DateTimeField,
  fromPickerString,
  toPickerString,
  type PickerMode,
} from "@/src/components/date-time-picker";
import { parseDateInput } from "@/src/lib/study";
import { useStudyTable, type StudyRow } from "@/src/lib/use-study-table";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";
import { actionSheet, notify, toast } from "@/src/lib/feedback";

/* ------------------------------ Shell ------------------------------ */

export function SyncBanner({
  offline,
  pending = 0,
  error,
  notice,
}: {
  offline?: boolean;
  pending?: number;
  error?: string | null;
  notice?: string | null;
}) {
  const colors = useTheme();
  const lines: string[] = [];
  if (offline) lines.push("Offline");
  if (pending > 0) lines.push(`${pending} to sync`);
  if (notice) lines.push(notice);
  if (error) lines.push(error);
  if (lines.length === 0) return null;
  return (
    <View style={[styles.banner, { backgroundColor: error ? colors.soft : colors.surface }]}>
      <Ionicons
        name={error ? "alert-circle" : offline ? "cloud-offline-outline" : "sync-outline"}
        size={16}
        color={error ? colors.danger : colors.muted}
      />
      <AppText size={12} weight="600" numberOfLines={2} style={{ flex: 1, color: error ? colors.danger : colors.muted }}>
        {lines.join(" · ")}
      </AppText>
    </View>
  );
}

export function StudyShell({
  title,
  subtitle,
  children,
  banner,
  refreshing,
  onRefresh,
  showBack = true,
  tabClearance = false,
  right,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  banner?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  showBack?: boolean;
  tabClearance?: boolean;
  right?: ReactNode;
}) {
  const colors = useTheme();
  const router = useRouter();
  return (
    <Screen tabClearance={tabClearance}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={!!refreshing}
                onRefresh={onRefresh}
                tintColor={colors.fg}
              />
            ) : undefined
          }
        >
          <View style={styles.header}>
            {showBack ? (
              <Pressable
                onPress={() =>
                  router.canGoBack()
                    ? router.back()
                    : router.replace("/(tabs)")
                }
                hitSlop={10}
                style={[styles.back, { backgroundColor: colors.surface }]}
              >
                <Ionicons name="arrow-back" size={20} color={colors.fg} />
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }}>
              <AppText size={24} weight="700" numberOfLines={1}>
                {title}
              </AppText>
              {subtitle ? (
                <AppText muted size={13} numberOfLines={1}>
                  {subtitle}
                </AppText>
              ) : null}
            </View>
            {right}
          </View>
          {banner}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/* ------------------------------ Rows ------------------------------ */

export type RowInfo = {
  title: string;
  subtitle?: string;
  meta?: string;
  done?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Short text in a pill on the right, e.g. a date or "Today". */
  badge?: string;
  badgeTone?: "neutral" | "warn" | "danger" | "success";
};

export function Row({
  info,
  pending,
  onDelete,
  icon,
}: {
  info: RowInfo;
  pending?: boolean;
  onDelete?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const colors = useTheme();
  const leadIcon = info.icon ?? icon;
  const badgeColor =
    info.badgeTone === "danger" ? colors.danger : info.badgeTone === "warn" ? colors.warn : info.badgeTone === "success" ? colors.success : colors.fg;
  const lead =
    info.onPress && info.done !== undefined ? (
      <Ionicons name={info.done ? "checkmark-circle" : "ellipse-outline"} size={26} color={info.done ? colors.success : colors.muted} />
    ) : leadIcon ? (
      <View style={[styles.rowIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={leadIcon} size={18} color={colors.fg} />
      </View>
    ) : null;
  return (
    <Pressable
      onPress={info.onPress}
      onLongPress={onDelete}
      disabled={!info.onPress && !onDelete}
      style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, opacity: pressed && info.onPress ? 0.8 : 1 }]}
    >
      {lead}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText
          weight="700"
          size={15}
          numberOfLines={2}
          style={info.done ? { textDecorationLine: "line-through", opacity: 0.55 } : undefined}
        >
          {info.title}
        </AppText>
        {info.subtitle ? (
          <AppText muted size={13} numberOfLines={2}>
            {info.subtitle}
          </AppText>
        ) : null}
        {info.meta || pending ? (
          <AppText muted size={11} weight="600">
            {[info.meta ? info.meta.replaceAll("_", " ") : null, pending ? "Not synced" : null].filter(Boolean).join(" · ").toUpperCase()}
          </AppText>
        ) : null}
      </View>
      {info.badge ? (
        <View style={[styles.badge, { backgroundColor: colors.soft }]}>
          <AppText size={11} weight="700" style={{ color: badgeColor }}>
            {info.badge}
          </AppText>
        </View>
      ) : null}
      {onDelete ? (
        <Pressable
          onPress={() => actionSheet(info.title, [{ text: "Delete", style: "destructive", onPress: onDelete }])}
          hitSlop={10}
          accessibilityLabel="More"
        >
          <Ionicons name="ellipsis-vertical" size={18} color={colors.muted} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export function confirmDelete(label: string, onConfirm: () => void) {
  notify(`Delete "${label}"?`, undefined, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: onConfirm },
  ]);
}

/* --------------------------- Add form --------------------------- */

export type FieldConfig = {
  key: string;
  label: string;
  placeholder?: string;
  type?: "text" | "number" | "multiline" | "select" | "date" | "datetime" | "time";
  options?: { label: string; value: string | number }[];
  required?: boolean;
  defaultValue?: string;
};

function defaultsFor(fields: FieldConfig[]) {
  const out: Record<string, string> = {};
  for (const f of fields) out[f.key] = f.defaultValue ?? "";
  return out;
}

/** Convert raw form strings into a typed insert draft, or an error message. */
export function buildDraft(
  fields: FieldConfig[],
  values: Record<string, string>,
): { draft: Record<string, unknown> } | { error: string } {
  const draft: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = (values[f.key] ?? "").trim();
    if (!raw) {
      if (f.required) return { error: `${f.label} is required.` };
      draft[f.key] = null;
      continue;
    }
    switch (f.type) {
      case "number": {
        const n = Number(raw);
        if (Number.isNaN(n)) return { error: `${f.label} must be a number.` };
        draft[f.key] = n;
        break;
      }
      case "date":
      case "datetime": {
        const iso = parseDateInput(raw);
        if (!iso) return { error: `Pick a ${f.label.toLowerCase()}.` };
        draft[f.key] = f.type === "date" ? iso.slice(0, 10) : iso;
        break;
      }
      case "time": {
        if (!/^\d{1,2}:\d{2}$/.test(raw)) return { error: `Pick a ${f.label.toLowerCase()}.` };
        draft[f.key] = raw.padStart(5, "0");
        break;
      }
      case "select": {
        const opt = f.options?.find((o) => String(o.value) === raw);
        draft[f.key] = opt ? opt.value : raw;
        break;
      }
      default:
        draft[f.key] = raw;
    }
  }
  return { draft };
}

export function AddForm({
  fields,
  submitLabel = "Save",
  onSubmit,
  onCancel,
  bare = false,
}: {
  fields: FieldConfig[];
  submitLabel?: string;
  onSubmit: (draft: Record<string, unknown>) => Promise<string | null>;
  onCancel?: () => void;
  bare?: boolean;
}) {
  const colors = useTheme();
  const [values, setValues] = useState<Record<string, string>>(() => defaultsFor(fields));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const built = buildDraft(fields, values);
    if ("error" in built) {
      setError(built.error);
      return;
    }
    setBusy(true);
    setError(null);
    const err = await onSubmit(built.draft);
    setBusy(false);
    if (err) setError(err);
    else setValues(defaultsFor(fields));
  }

  return (
    <View style={bare ? { gap: 14 } : [styles.formCard, { backgroundColor: colors.surface }]}>
      {fields.map((f) => (
        <Field key={f.key} label={f.required ? `${f.label} *` : f.label}>
          {f.type === "select" ? (
            <View style={styles.wrap}>
              {f.options?.map((o) => (
                <Chip
                  key={String(o.value)}
                  label={o.label}
                  active={values[f.key] === String(o.value)}
                  onPress={() => setValues((v) => ({ ...v, [f.key]: String(o.value) }))}
                />
              ))}
            </View>
          ) : f.type === "date" || f.type === "datetime" || f.type === "time" ? (
            <DateTimeField
              mode={f.type}
              value={fromPickerString(values[f.key], f.type)}
              onChange={(d) => setValues((v) => ({ ...v, [f.key]: toPickerString(d, f.type as PickerMode) }))}
              placeholder={f.placeholder}
            />
          ) : (
            <Input
              value={values[f.key]}
              onChangeText={(t) => setValues((v) => ({ ...v, [f.key]: t }))}
              placeholder={f.placeholder}
              keyboardType={f.type === "number" ? "decimal-pad" : "default"}
              multiline={f.type === "multiline"}
              autoCapitalize={f.type === "text" || f.type === "multiline" ? "sentences" : "none"}
              style={
                f.type === "multiline"
                  ? { height: 120, paddingTop: 14, textAlignVertical: "top" }
                  : undefined
              }
            />
          )}
        </Field>
      ))}
      {error ? (
        <AppText size={13} style={{ color: colors.danger }}>
          {error}
        </AppText>
      ) : null}
      <View style={{ flexDirection: "row", gap: 10 }}>
        {onCancel ? (
          <Button title="Cancel" variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
        ) : null}
        <Button title={submitLabel} onPress={submit} loading={busy} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

/** Bottom sheet that holds a form. */
export function FormSheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <Pressable style={styles.scrim} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.bg, paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <View style={styles.sheetHead}>
            <AppText size={18} weight="700" style={{ flex: 1 }}>
              {title}
            </AppText>
            <Pressable onPress={onClose} hitSlop={10} style={[styles.close, { backgroundColor: colors.surface }]} accessibilityLabel="Close">
              <Ionicons name="close" size={18} color={colors.fg} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Round "+" button for screen headers. */
export function AddButton({ onPress, label = "Add" }: { onPress: () => void; label?: string }) {
  const colors = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityLabel={label} style={[styles.addBtn, { backgroundColor: colors.inverseBg }]}>
      <Ionicons name="add" size={22} color={colors.inverseFg} />
    </Pressable>
  );
}

/* --------------------------- CRUD screen --------------------------- */

type Api<T extends StudyRow> = {
  update: (id: string, patch: Record<string, unknown>) => Promise<{ error: string | null }>;
  remove: (id: string) => Promise<{ error: string | null }>;
  items: T[];
};

export type CrudScreenProps<T extends StudyRow> = {
  title: string;
  subtitle?: string;
  table: string;
  cacheKey: string;
  remote?: boolean;
  orderBy?: { column: string; ascending?: boolean };
  fields: FieldConfig[];
  addLabel?: string;
  emptyTitle: string;
  emptyBody: string;
  renderItem: (item: T, api: Api<T>) => RowInfo;
  /** Adjust draft before it is stored (e.g. add defaults) */
  transformDraft?: (draft: Record<string, unknown>) => Record<string, unknown>;
  /** Content above the list (summary cards etc.) */
  header?: (items: T[]) => ReactNode;
  sortItems?: (items: T[]) => T[];
  allowDelete?: boolean;
  /** Icon on each row and on the empty state. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Text to search on; shows a search box once the list is long. */
  searchText?: (item: T) => string;
  /** Splits the list under small headings. */
  groupBy?: (item: T) => string;
};

export function CrudScreen<T extends StudyRow = StudyRow>(props: CrudScreenProps<T>) {
  const {
    title,
    table,
    cacheKey,
    remote,
    orderBy,
    fields,
    addLabel = "Add",
    emptyTitle,
    emptyBody,
    renderItem,
    transformDraft,
    header,
    sortItems,
    allowDelete = true,
    icon,
    searchText,
    groupBy,
  } = props;
  const store = useStudyTable<T>({ table, cacheKey, orderBy, remote });
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");

  const list = useMemo(() => {
    const sorted = sortItems ? sortItems(store.items) : store.items;
    const q = query.trim().toLowerCase();
    if (!q || !searchText) return sorted;
    return sorted.filter((i) => searchText(i).toLowerCase().includes(q));
  }, [store.items, sortItems, query, searchText]);

  const groups = useMemo(() => {
    if (!groupBy) return [{ label: "", items: list }];
    const out: { label: string; items: T[] }[] = [];
    for (const item of list) {
      const label = groupBy(item);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(item);
      else out.push({ label, items: [item] });
    }
    return out;
  }, [list, groupBy]);

  async function onSubmit(draft: Record<string, unknown>) {
    const res = await store.add(transformDraft ? transformDraft(draft) : draft);
    if (res.error) return res.error;
    setAdding(false);
    if (res.queued && remote !== false) toast.info("Saved offline", "It will sync when you're online.");
    else toast.success("Saved");
    return null;
  }

  async function onDelete(item: T, label: string) {
    confirmDelete(label, async () => {
      const res = await store.remove(item.id);
      if (res.error) notify("Could not delete", res.error);
    });
  }

  const api: Api<T> = {
    update: async (id, patch) => {
      const res = await store.update(id, patch);
      if (res.error) notify("Could not update", res.error);
      return res;
    },
    remove: store.remove,
    items: store.items,
  };

  return (
    <StudyShell
      title={title}
      refreshing={store.refreshing}
      onRefresh={store.refresh}
      right={<AddButton onPress={() => setAdding(true)} label={addLabel} />}
      banner={<SyncBanner offline={store.offline} pending={store.pendingCount} error={store.error} />}
    >
      {header ? header(store.items) : null}

      {searchText && store.items.length > 6 ? <SearchBar value={query} onChangeText={setQuery} placeholder={`Search ${title.toLowerCase()}`} /> : null}

      {store.loading ? null : store.items.length === 0 ? (
        <Empty
          icon={icon ?? "add-circle-outline"}
          title={emptyTitle}
          body={emptyBody}
          action={<Button compact title={addLabel} onPress={() => setAdding(true)} style={{ marginTop: 8 }} />}
        />
      ) : list.length === 0 ? (
        <Empty icon="search-outline" title="No matches" />
      ) : (
        groups.map((g) => (
          <View key={g.label || "all"} style={{ gap: 8 }}>
            {g.label ? (
              <AppText muted size={12} weight="700" style={{ marginLeft: 4 }}>
                {g.label.toUpperCase()}
              </AppText>
            ) : null}
            {g.items.map((item) => {
              const info = renderItem(item, api);
              return (
                <Row
                  key={item.id}
                  info={info}
                  icon={icon}
                  pending={item._pending}
                  onDelete={allowDelete ? () => onDelete(item, info.title) : undefined}
                />
              );
            })}
          </View>
        ))
      )}

      <FormSheet visible={adding} title={addLabel} onClose={() => setAdding(false)}>
        <AddForm bare fields={fields} submitLabel="Save" onSubmit={onSubmit} />
      </FormSheet>
    </StudyShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingTop: 4, paddingBottom: 40 },
  header: { flexDirection: "row", alignItems: "center", gap: 14 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radii.md },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radii.pill },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  formCard: { gap: 14, borderRadius: radii.lg, padding: 16 },
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, paddingHorizontal: 20, paddingTop: 10, maxHeight: "88%" },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: "center", marginBottom: 10 },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  close: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  addBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
});
