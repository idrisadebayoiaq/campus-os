import { useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  AppText,
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Input,
  Screen,
} from "@/src/components/ui";
import { parseDateInput } from "@/src/lib/study";
import { useStudyTable, type StudyRow } from "@/src/lib/use-study-table";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

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
  if (offline) lines.push("Offline — showing saved data");
  if (pending > 0)
    lines.push(`${pending} item${pending === 1 ? "" : "s"} waiting to sync`);
  if (notice) lines.push(notice);
  if (error) lines.push(error);
  if (lines.length === 0) return null;
  return (
    <View style={[styles.banner, { backgroundColor: colors.surface }]}>
      <Ionicons
        name={
          error
            ? "refresh-circle"
            : offline
              ? "cloud-offline-outline"
              : "sync-outline"
        }
        size={18}
        color={error ? colors.danger : colors.muted}
      />
      <View style={{ flex: 1 }}>
        {lines.map((l) => (
          <AppText
            key={l}
            size={13}
            muted={l !== error}
            style={error === l ? { color: colors.danger } : undefined}
          >
            {l}
          </AppText>
        ))}
      </View>
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
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  banner?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  showBack?: boolean;
  tabClearance?: boolean;
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
              <AppText size={24} weight="700">
                {title}
              </AppText>
              {subtitle ? (
                <AppText muted size={13}>
                  {subtitle}
                </AppText>
              ) : null}
            </View>
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
};

export function Row({
  info,
  pending,
  onDelete,
}: {
  info: RowInfo;
  pending?: boolean;
  onDelete?: () => void;
}) {
  const colors = useTheme();
  const content = (
    <Card style={styles.row}>
      {info.onPress && info.done !== undefined ? (
        <Ionicons
          name={info.done ? "checkmark-circle" : "ellipse-outline"}
          size={24}
          color={info.done ? colors.success : colors.muted}
        />
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText
          weight="700"
          size={16}
          style={info.done ? { textDecorationLine: "line-through", opacity: 0.6 } : undefined}
        >
          {info.title}
        </AppText>
        {info.subtitle ? (
          <AppText muted size={13}>
            {info.subtitle}
          </AppText>
        ) : null}
        {info.meta || pending ? (
          <AppText muted size={12}>
            {[info.meta, pending ? "Not synced yet" : null].filter(Boolean).join(" · ")}
          </AppText>
        ) : null}
      </View>
      {onDelete ? (
        <Pressable onPress={onDelete} hitSlop={10}>
          <Ionicons name="trash-outline" size={18} color={colors.muted} />
        </Pressable>
      ) : null}
    </Card>
  );
  return info.onPress ? <Pressable onPress={info.onPress}>{content}</Pressable> : content;
}

export function confirmDelete(label: string, onConfirm: () => void) {
  Alert.alert("Delete", `Remove ${label}?`, [
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
        if (!iso) return { error: `${f.label}: use YYYY-MM-DD${f.type === "datetime" ? " HH:MM" : ""}.` };
        draft[f.key] = f.type === "date" ? iso.slice(0, 10) : iso;
        break;
      }
      case "time": {
        if (!/^\d{1,2}:\d{2}$/.test(raw)) return { error: `${f.label}: use HH:MM.` };
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
}: {
  fields: FieldConfig[];
  submitLabel?: string;
  onSubmit: (draft: Record<string, unknown>) => Promise<string | null>;
  onCancel?: () => void;
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
    <Card style={{ gap: 14, borderRadius: radii.lg }}>
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
          ) : (
            <Input
              value={values[f.key]}
              onChangeText={(t) => setValues((v) => ({ ...v, [f.key]: t }))}
              placeholder={
                f.placeholder ??
                (f.type === "date"
                  ? "YYYY-MM-DD"
                  : f.type === "datetime"
                    ? "YYYY-MM-DD HH:MM"
                    : f.type === "time"
                      ? "HH:MM"
                      : undefined)
              }
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
    </Card>
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
};

export function CrudScreen<T extends StudyRow = StudyRow>(props: CrudScreenProps<T>) {
  const {
    title,
    subtitle,
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
  } = props;
  const store = useStudyTable<T>({ table, cacheKey, orderBy, remote });
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const list = useMemo(
    () => (sortItems ? sortItems(store.items) : store.items),
    [store.items, sortItems],
  );

  async function onSubmit(draft: Record<string, unknown>) {
    const res = await store.add(transformDraft ? transformDraft(draft) : draft);
    if (res.error) return res.error;
    setNotice(res.queued && remote !== false ? "Saved on this device. Will sync when online." : null);
    setAdding(false);
    return null;
  }

  async function onDelete(item: T, label: string) {
    confirmDelete(label, async () => {
      const res = await store.remove(item.id);
      if (res.error) Alert.alert("Could not delete", res.error);
    });
  }

  const api: Api<T> = {
    update: async (id, patch) => {
      const res = await store.update(id, patch);
      if (res.error) Alert.alert("Could not update", res.error);
      return res;
    },
    remove: store.remove,
    items: store.items,
  };

  return (
    <StudyShell
      title={title}
      subtitle={subtitle}
      refreshing={store.refreshing}
      onRefresh={store.refresh}
      banner={
        <SyncBanner
          offline={store.offline}
          pending={store.pendingCount}
          error={store.error}
          notice={notice}
        />
      }
    >
      {header ? header(store.items) : null}

      {adding ? (
        <AddForm
          fields={fields}
          submitLabel="Save"
          onSubmit={onSubmit}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <Button title={addLabel} onPress={() => setAdding(true)} />
      )}

      {store.loading ? null : list.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyBody} />
      ) : (
        <View style={{ gap: 12 }}>
          {list.map((item) => {
            const info = renderItem(item, api);
            return (
              <Row
                key={item.id}
                info={info}
                pending={item._pending}
                onDelete={allowDelete ? () => onDelete(item, info.title) : undefined}
              />
            );
          })}
        </View>
      )}
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
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
