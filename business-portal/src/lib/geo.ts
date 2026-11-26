export type LatLng = { lat: number; lng: number };

export type Place = LatLng & {
  id: string;
  title: string;
  subtitle: string;
  label: string;
  city?: string;
  state?: string;
};

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

/** Address autocomplete ranked around `near` (OpenStreetMap data via Photon). */
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
  const seen = new Set<string>();
  return (json.features ?? []).map(toPlace).filter((p) => {
    if (seen.has(p.label)) return false;
    seen.add(p.label);
    return true;
  });
}

export async function reverseGeocode(point: LatLng): Promise<Place> {
  try {
    const res = await fetch(`${PHOTON}/reverse?lat=${point.lat}&lon=${point.lng}&lang=en`);
    const json = (await res.json()) as { features?: PhotonFeature[] };
    const f = json.features?.[0];
    if (f) return { ...toPlace(f), lat: point.lat, lng: point.lng };
  } catch {
    // fall back to coordinates
  }
  const label = `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
  return { id: label, ...point, title: "Pinned location", subtitle: label, label };
}
