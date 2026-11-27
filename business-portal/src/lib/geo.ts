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

/** Public Mapbox token ("pk." only). Optional: without it we use free OpenStreetMap services. */
const MAPBOX_TOKEN = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "").trim();
export const mapboxEnabled = MAPBOX_TOKEN.startsWith("pk.");
const MAPBOX_GEOCODE = "https://api.mapbox.com/search/geocode/v6";

type MapboxCtx = { name?: string };
type MapboxFeature = {
  id?: string;
  geometry: { coordinates: [number, number] };
  properties: {
    mapbox_id?: string;
    name?: string;
    name_preferred?: string;
    place_formatted?: string;
    context?: { place?: MapboxCtx; district?: MapboxCtx; locality?: MapboxCtx; region?: MapboxCtx };
  };
};

function mapboxToPlace(f: MapboxFeature): Place {
  const p = f.properties;
  const [lng, lat] = f.geometry.coordinates;
  const title = p.name_preferred || p.name || "Pinned location";
  const subtitle = (p.place_formatted ?? "").replace(/,\s*Nigeria$/i, "");
  return {
    id: p.mapbox_id ?? f.id ?? `${lat},${lng}`,
    lat,
    lng,
    title,
    subtitle,
    label: [title, subtitle].filter(Boolean).join(", "),
    city: p.context?.place?.name ?? p.context?.district?.name ?? p.context?.locality?.name,
    state: p.context?.region?.name,
  };
}

/**
 * Adds the base map to a Leaflet map: Mapbox when a token is set (falls back to Carto if tiles fail),
 * otherwise Carto/OpenStreetMap.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function addBaseTiles(L: any, map: any, dark: boolean, hooks?: { onLoad?: () => void; onFail?: () => void }) {
  let loaded = 0;
  let cartoErrors = 0;
  let failed = false;
  const noteLoad = () => {
    loaded += 1;
    if (loaded === 1) hooks?.onLoad?.();
  };
  const carto = L.tileLayer(
    `https://{s}.basemaps.cartocdn.com/${dark ? "dark_all" : "rastertiles/voyager"}/{z}/{x}/{y}{r}.png`,
    { subdomains: "abcd", maxZoom: 20, attribution: "&copy; OpenStreetMap &copy; CARTO" },
  );
  // Every provider failed and nothing ever drew: tell the picker so it can offer manual entry.
  carto.on("tileload", noteLoad);
  carto.on("tileerror", () => {
    cartoErrors += 1;
    if (cartoErrors >= 4 && loaded === 0 && !failed) {
      failed = true;
      hooks?.onFail?.();
    }
  });
  if (!mapboxEnabled) {
    carto.addTo(map);
    return;
  }
  const style = dark ? "dark-v11" : "streets-v12";
  const mb = L.tileLayer(
    `https://api.mapbox.com/styles/v1/mapbox/${style}/tiles/256/{z}/{x}/{y}{r}?access_token=${encodeURIComponent(MAPBOX_TOKEN)}`,
    { maxZoom: 19, attribution: "&copy; Mapbox &copy; OpenStreetMap" },
  );
  let bad = 0;
  mb.on("tileload", noteLoad);
  mb.on("tileerror", () => {
    bad += 1;
    if (bad >= 3 && loaded === 0 && map.hasLayer(mb)) {
      map.removeLayer(mb);
      carto.addTo(map);
    }
  });
  mb.addTo(map);
}

async function searchMapbox(q: string, near: LatLng | null | undefined, signal?: AbortSignal): Promise<Place[] | null> {
  try {
    const params = new URLSearchParams({
      q,
      access_token: MAPBOX_TOKEN,
      country: "ng",
      limit: "8",
      language: "en",
      autocomplete: "true",
    });
    if (near) params.set("proximity", `${near.lng},${near.lat}`);
    const res = await fetch(`${MAPBOX_GEOCODE}/forward?${params}`, { signal });
    if (!res.ok) return null;
    const json = (await res.json()) as { features?: MapboxFeature[] };
    return (json.features ?? []).map(mapboxToPlace);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    return null;
  }
}

async function reverseMapbox(point: LatLng): Promise<Place | null> {
  try {
    const params = new URLSearchParams({
      longitude: String(point.lng),
      latitude: String(point.lat),
      access_token: MAPBOX_TOKEN,
      language: "en",
      limit: "1",
    });
    const res = await fetch(`${MAPBOX_GEOCODE}/reverse?${params}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { features?: MapboxFeature[] };
    const f = json.features?.[0];
    return f ? { ...mapboxToPlace(f), lat: point.lat, lng: point.lng } : null;
  } catch {
    return null;
  }
}

/** Address autocomplete ranked around `near` (Mapbox when configured, else OpenStreetMap via Photon). */
export async function searchPlaces(
  query: string,
  near?: LatLng | null,
  signal?: AbortSignal,
): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  if (mapboxEnabled) {
    const found = await searchMapbox(q, near, signal);
    if (found && found.length) return found;
  }
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
  if (mapboxEnabled) {
    const place = await reverseMapbox(point);
    if (place) return place;
  }
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
