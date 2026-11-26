import type { SupabaseClient } from "@supabase/supabase-js";
import * as Location from "expo-location";

export type LatLng = { lat: number; lng: number };

export type Place = LatLng & {
  id: string;
  /** Short name, e.g. "Bodija Market" */
  title: string;
  /** Rest of the address, e.g. "Bodija, Ibadan, Oyo" */
  subtitle: string;
  /** Full single-line label stored in the database */
  label: string;
  city?: string;
  state?: string;
};

/** Default map centre when we know nothing about the user (Nigeria). */
export const NIGERIA_CENTER: LatLng = { lat: 9.082, lng: 8.6753 };

const PHOTON = "https://photon.komoot.io";

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_id?: number;
    osm_type?: string;
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    locality?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
  };
};

function toPlace(f: PhotonFeature): Place {
  const p = f.properties;
  const [lng, lat] = f.geometry.coordinates;
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const title = p.name || street || p.district || p.city || p.county || p.state || "Pinned location";
  const parts = [
    p.name && street ? street : null,
    p.district || p.locality,
    p.city || p.county,
    p.state,
  ].filter((v, i, arr): v is string => !!v && v !== title && arr.indexOf(v) === i);
  const subtitle = parts.join(", ") || p.country || "";
  return {
    id: `${p.osm_type ?? "x"}${p.osm_id ?? `${lat},${lng}`}`,
    lat,
    lng,
    title,
    subtitle,
    label: [title, subtitle].filter(Boolean).join(", "),
    city: p.city || p.county,
    state: p.state,
  };
}

/** Address / place autocomplete, ranked around `near` when given. */
export async function searchPlaces(
  query: string,
  near?: LatLng | null,
  signal?: AbortSignal,
): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({ q, limit: "8", lang: "en" });
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lon", String(near.lng));
    params.set("location_bias_scale", "0.4");
  }
  const res = await fetch(`${PHOTON}/api/?${params}`, { signal });
  if (!res.ok) return [];
  const json = (await res.json()) as { features?: PhotonFeature[] };
  const places = (json.features ?? []).map(toPlace);
  const seen = new Set<string>();
  return places.filter((p) => {
    if (seen.has(p.label)) return false;
    seen.add(p.label);
    return true;
  });
}

export async function reverseGeocode(point: LatLng): Promise<Place> {
  try {
    const res = await fetch(
      `${PHOTON}/reverse?lat=${point.lat}&lon=${point.lng}&lang=en`,
    );
    const json = (await res.json()) as { features?: PhotonFeature[] };
    const f = json.features?.[0];
    if (f) return { ...toPlace(f), lat: point.lat, lng: point.lng };
  } catch {
    // fall through to a coordinate label
  }
  const label = `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
  return { id: label, ...point, title: "Pinned location", subtitle: label, label };
}

/** Ask for permission and read the device position. Returns null if denied. */
export async function currentPosition(): Promise<LatLng | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") return null;
  try {
    const last = await Location.getLastKnownPositionAsync();
    const pos =
      last ??
      (await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }));
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export type SavedLocation = LatLng & { label: string };

export async function loadSavedLocation(
  supabase: SupabaseClient,
  userId: string,
): Promise<SavedLocation | null> {
  const { data } = await supabase
    .from("profiles")
    .select("location_label, location_lat, location_lng")
    .eq("id", userId)
    .maybeSingle();
  if (data?.location_lat == null || data?.location_lng == null) return null;
  return {
    label: data.location_label ?? "",
    lat: data.location_lat,
    lng: data.location_lng,
  };
}

export async function saveLocation(
  supabase: SupabaseClient,
  userId: string,
  place: SavedLocation,
) {
  return supabase
    .from("profiles")
    .update({
      location_label: place.label,
      location_lat: place.lat,
      location_lng: place.lng,
      location_updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
}
