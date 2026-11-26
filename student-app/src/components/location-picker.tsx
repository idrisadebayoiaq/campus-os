import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MapPicker, type MapPickerHandle } from "@/src/components/map-picker";
import { AppText, Button } from "@/src/components/ui";
import {
  NIGERIA_CENTER,
  currentPosition,
  reverseGeocode,
  searchPlaces,
  type LatLng,
  type Place,
} from "@/src/lib/location";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

export type PickedLocation = LatLng & { label: string; title: string; subtitle: string };

/**
 * Full-screen location chooser: search (ranked around the user), drag the map
 * under the pin, or jump to the device's GPS position.
 */
export function LocationPicker({
  visible,
  title = "Choose location",
  confirmLabel = "Use this location",
  initial,
  bias,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  title?: string;
  confirmLabel?: string;
  initial?: LatLng | null;
  bias?: LatLng | null;
  onClose: () => void;
  onConfirm: (place: PickedLocation) => void;
}) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const map = useRef<MapPickerHandle>(null);
  const [start, setStart] = useState<{ point: LatLng; zoom: number } | null>(null);
  const [center, setCenter] = useState<LatLng | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [resolving, setResolving] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [gpsDenied, setGpsDenied] = useState(false);
  const skipReverse = useRef<Place | null>(null);

  useEffect(() => {
    if (!visible) {
      setStart(null);
      setQuery("");
      setResults([]);
      setPlace(null);
      return;
    }
    let cancelled = false;
    (async () => {
      if (initial) {
        setStart({ point: initial, zoom: 16 });
        return;
      }
      setLocating(true);
      const gps = await currentPosition();
      if (cancelled) return;
      setLocating(false);
      if (gps) setStart({ point: gps, zoom: 16 });
      else {
        setGpsDenied(true);
        setStart({ point: bias ?? NIGERIA_CENTER, zoom: bias ? 13 : 6 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!center) return;
    if (skipReverse.current) {
      setPlace({ ...skipReverse.current, ...center });
      skipReverse.current = null;
      return;
    }
    let cancelled = false;
    setResolving(true);
    const t = setTimeout(async () => {
      const p = await reverseGeocode(center);
      if (!cancelled) {
        setPlace(p);
        setResolving(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [center]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const found = await searchPlaces(q, center ?? bias ?? start?.point, ctrl.signal);
        setResults(found);
      } catch {
        // aborted or offline
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  function choose(p: Place) {
    Keyboard.dismiss();
    setQuery("");
    setResults([]);
    skipReverse.current = p;
    setPlace(p);
    map.current?.flyTo(p, 17);
  }

  async function locateMe() {
    setLocating(true);
    const gps = await currentPosition();
    setLocating(false);
    if (!gps) {
      setGpsDenied(true);
      return;
    }
    setGpsDenied(false);
    map.current?.flyTo(gps, 17);
  }

  const showResults = query.trim().length >= 2;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <View style={styles.mapArea}>
          {start ? (
            <MapPicker
              ref={map}
              initial={start.point}
              zoom={start.zoom}
              onCenterChange={setCenter}
              onMoveStart={() => setResolving(true)}
            />
          ) : (
            <View style={styles.center}>
              <ActivityIndicator color={colors.fg} />
              <AppText muted size={13} style={{ marginTop: 10 }}>
                Finding where you are…
              </AppText>
            </View>
          )}

          <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
            <View style={styles.topRow}>
              <Pressable
                onPress={onClose}
                style={[styles.roundBtn, { backgroundColor: colors.bg }]}
                hitSlop={8}
              >
                <Ionicons name="close" size={22} color={colors.fg} />
              </Pressable>
              <View
                style={[
                  styles.searchBox,
                  { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
                ]}
              >
                <Ionicons name="search" size={18} color={colors.muted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search street, area or landmark"
                  placeholderTextColor={colors.muted}
                  selectionColor={colors.accent}
                  returnKeyType="search"
                  style={[styles.searchInput, { color: colors.fg }]}
                />
                {searching ? (
                  <ActivityIndicator size="small" color={colors.muted} />
                ) : query ? (
                  <Pressable onPress={() => setQuery("")} hitSlop={10}>
                    <Ionicons name="close-circle" size={18} color={colors.muted} />
                  </Pressable>
                ) : null}
              </View>
            </View>

            {showResults ? (
              <View style={[styles.results, { backgroundColor: colors.bg }]}>
                <FlatList
                  data={results}
                  keyExtractor={(p) => p.id}
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={
                    searching ? undefined : (
                      <AppText muted size={14} style={{ padding: 16 }}>
                        No places found. Try a nearby landmark or street.
                      </AppText>
                    )
                  }
                  renderItem={({ item, index }) => (
                    <Pressable
                      onPress={() => choose(item)}
                      style={({ pressed }) => [
                        styles.resultRow,
                        index > 0 && {
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderTopColor: colors.border,
                        },
                        pressed && { backgroundColor: colors.surface },
                      ]}
                    >
                      <View style={[styles.resultIcon, { backgroundColor: colors.surface }]}>
                        <Ionicons name="location-outline" size={16} color={colors.fg} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <AppText size={15} weight="600" numberOfLines={1}>
                          {item.title}
                        </AppText>
                        {item.subtitle ? (
                          <AppText size={12} muted numberOfLines={1}>
                            {item.subtitle}
                          </AppText>
                        ) : null}
                      </View>
                    </Pressable>
                  )}
                />
              </View>
            ) : null}
          </View>

          {start && !showResults ? (
            <Pressable
              onPress={() => void locateMe()}
              style={[styles.locateBtn, { backgroundColor: colors.bg }]}
            >
              {locating ? (
                <ActivityIndicator size="small" color={colors.fg} />
              ) : (
                <Ionicons name="navigate" size={20} color={colors.fg} />
              )}
            </Pressable>
          ) : null}
        </View>

        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.bg, paddingBottom: Math.max(insets.bottom, 16) + 4 },
          ]}
        >
          <AppText size={13} muted weight="600">
            {title.toUpperCase()}
          </AppText>
          <View style={styles.addressRow}>
            <View style={[styles.addressIcon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="location" size={18} color={colors.fg} />
            </View>
            <View style={{ flex: 1, minHeight: 42, justifyContent: "center" }}>
              {resolving || !place ? (
                <AppText muted size={14}>
                  {start ? "Getting address…" : "Loading map…"}
                </AppText>
              ) : (
                <>
                  <AppText size={16} weight="700" numberOfLines={1}>
                    {place.title}
                  </AppText>
                  {place.subtitle ? (
                    <AppText size={13} muted numberOfLines={2}>
                      {place.subtitle}
                    </AppText>
                  ) : null}
                </>
              )}
            </View>
          </View>
          {gpsDenied ? (
            <AppText size={12} muted>
              Location access is off. Search or drag the map to set your spot.
            </AppText>
          ) : (
            <AppText size={12} muted>
              Drag the map to move the pin exactly where you are.
            </AppText>
          )}
          <Button
            title={confirmLabel}
            disabled={!place || resolving}
            onPress={() => {
              if (!place) return;
              onConfirm({
                lat: center?.lat ?? place.lat,
                lng: center?.lng ?? place.lng,
                label: place.label,
                title: place.title,
                subtitle: place.subtitle,
              });
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

/** Tappable field that shows the chosen address and opens the picker. */
export function LocationField({
  value,
  placeholder = "Choose on map",
  onPress,
}: {
  value?: string | null;
  placeholder?: string;
  onPress: () => void;
}) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.field,
        {
          backgroundColor: colors.inputBg,
          borderColor: colors.inputBorder,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Ionicons name="location-outline" size={20} color={value ? colors.fg : colors.muted} />
      <AppText
        size={15}
        muted={!value}
        numberOfLines={2}
        style={{ flex: 1 }}
      >
        {value || placeholder}
      </AppText>
      <Ionicons name="map-outline" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  mapArea: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { position: "absolute", left: 0, right: 0, top: 0, paddingHorizontal: 14, gap: 8 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  roundBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  searchBox: {
    flex: 1,
    height: 48,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  results: {
    borderRadius: radii.md,
    maxHeight: 340,
    overflow: "hidden",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  resultIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  locateBtn: {
    position: "absolute",
    right: 16,
    bottom: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  sheet: {
    marginTop: -24,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
  },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  addressIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  field: {
    minHeight: 54,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});
