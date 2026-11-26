import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from "react-native";
import type { PickedLocation } from "@/src/components/location-picker";
import { AppText } from "@/src/components/ui";
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

/**
 * Type-and-pick location field: results are ranked around the device position
 * (when permission is given) and the user taps one. No map needed.
 */
export function LocationSearch({
  value,
  onChange,
  placeholder = "Search your area, street or hostel",
}: {
  value: PickedLocation | null;
  onChange: (place: PickedLocation | null) => void;
  placeholder?: string;
}) {
  const colors = useTheme();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [near, setNear] = useState<LatLng | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Ask for permission once so results can be ranked around the user.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const pos = await currentPosition();
      if (!cancelled && pos) setNear(pos);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const q = query.trim();
    abortRef.current?.abort();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);
    const timer = setTimeout(() => {
      searchPlaces(q, near ?? NIGERIA_CENTER, controller.signal)
        .then((places) => {
          if (controller.signal.aborted) return;
          setResults(places);
          setSearching(false);
        })
        .catch(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, near]);

  function pick(place: Place) {
    onChange({
      lat: place.lat,
      lng: place.lng,
      label: place.label,
      title: place.title,
      subtitle: place.subtitle,
    });
    setQuery("");
    setResults([]);
    setNotice(null);
  }

  async function useCurrent() {
    setLocating(true);
    setNotice(null);
    const pos = near ?? (await currentPosition());
    if (!pos) {
      setLocating(false);
      setNotice("Location permission is off. Search for your area instead.");
      return;
    }
    setNear(pos);
    const place = await reverseGeocode(pos);
    setLocating(false);
    pick(place);
  }

  if (value) {
    return (
      <View style={[styles.chosen, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
        <View style={[styles.pinIcon, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name="location" size={20} color={colors.fg} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText size={15} weight="700" numberOfLines={1}>
            {value.title}
          </AppText>
          {value.subtitle ? (
            <AppText size={13} muted numberOfLines={2}>
              {value.subtitle}
            </AppText>
          ) : null}
        </View>
        <Pressable onPress={() => onChange(null)} hitSlop={8} accessibilityLabel="Change location">
          <AppText size={13} weight="700" style={{ color: colors.accent }}>
            Change
          </AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <View
        style={[
          styles.inputWrap,
          {
            backgroundColor: colors.inputBg,
            borderColor: focused ? colors.accent : colors.inputBorder,
          },
        ]}
      >
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => results[0] && pick(results[0])}
          style={[styles.input, { color: colors.fg }]}
        />
        {searching ? <ActivityIndicator size="small" color={colors.muted} /> : null}
        {!searching && query ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.list, { backgroundColor: colors.surface }]}>
        <Pressable
          onPress={() => void useCurrent()}
          disabled={locating}
          style={({ pressed }) => [
            styles.row,
            results.length > 0 && {
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: colors.border,
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          <View style={[styles.rowIcon, { backgroundColor: colors.accentSoft }]}>
            {locating ? (
              <ActivityIndicator size="small" color={colors.fg} />
            ) : (
              <Ionicons name="navigate" size={16} color={colors.fg} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <AppText size={15} weight="600">
              Use my current location
            </AppText>
            <AppText size={12} muted>
              {near ? "Location permission is on" : "We'll ask for location permission"}
            </AppText>
          </View>
        </Pressable>
        {results.map((place, i) => (
          <Pressable
            key={place.id}
            onPress={() => pick(place)}
            style={({ pressed }) => [
              styles.row,
              i < results.length - 1 && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.border,
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <View style={[styles.rowIcon, { backgroundColor: colors.bg }]}>
              <Ionicons name="location-outline" size={16} color={colors.muted} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText size={15} weight="600" numberOfLines={1}>
                {place.title}
              </AppText>
              {place.subtitle ? (
                <AppText size={12} muted numberOfLines={1}>
                  {place.subtitle}
                </AppText>
              ) : null}
            </View>
          </Pressable>
        ))}
      </View>

      {query.trim().length >= 2 && !searching && results.length === 0 ? (
        <AppText size={13} muted>
          No places found. Try a nearby landmark, street or town.
        </AppText>
      ) : null}
      {notice ? (
        <AppText size={13} style={{ color: colors.danger }}>
          {notice}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderRadius: radii.sm,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 12 },
  list: { borderRadius: radii.md, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  chosen: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1.5,
    borderRadius: radii.md,
    padding: 14,
  },
  pinIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
