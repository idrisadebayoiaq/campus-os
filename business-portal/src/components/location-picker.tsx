"use client";

import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";
import { useEffect, useRef, useState } from "react";
import {
  addBaseTiles,
  NIGERIA_CENTER,
  reverseGeocode,
  searchPlaces,
  type LatLng,
  type Place,
} from "@/lib/geo";

export type PickedPlace = LatLng & {
  label: string;
  city?: string;
  state?: string;
  /** True when the address was typed by hand and the coordinates are only the campus centre */
  approximate?: boolean;
};

/**
 * Search + drag-the-map location picker. Renders hidden inputs so it works
 * inside plain <form> submissions, and reports changes through `onChange`.
 */
export function LocationPicker({
  names = { address: "address", lat: "lat", lng: "lng" },
  defaultValue,
  bias,
  required,
  addressLabel = "Address shown on CampusOS",
  addressHint = "Add a landmark if it helps people find you, e.g. \"Opposite the main gate\".",
  allowApproximate = false,
  onChange,
}: {
  names?: { address: string; lat: string; lng: string };
  defaultValue?: PickedPlace | null;
  bias?: LatLng | null;
  required?: boolean;
  addressLabel?: string;
  addressHint?: string;
  /**
   * When the map can't be used, accept a typed address and report the `bias` point (e.g. the campus centre)
   * as approximate coordinates, so the form can still be completed.
   */
  allowApproximate?: boolean;
  onChange?: (place: PickedPlace | null) => void;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const skipReverse = useRef<Place | null>(null);
  const [center, setCenter] = useState<LatLng | null>(
    defaultValue ? { lat: defaultValue.lat, lng: defaultValue.lng } : null,
  );
  const [address, setAddress] = useState(defaultValue?.label ?? "");
  const [meta, setMeta] = useState<{ city?: string; state?: string }>({
    city: defaultValue?.city,
    state: defaultValue?.state,
  });
  const [touched, setTouched] = useState(Boolean(defaultValue));
  const [resolving, setResolving] = useState(false);
  const [moving, setMoving] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  // Manual entry: the person filling in the form types the address instead of using the map.
  const [manual, setManual] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const mapDrew = useRef(false);
  const showManual = manual || mapFailed;

  // Build the Leaflet map once on the client.
  useEffect(() => {
    let cancelled = false;
    // If no map tile has drawn after a few seconds, assume the map is blocked and offer typing instead.
    const watchdog = setTimeout(() => {
      if (!mapDrew.current) setMapFailed(true);
    }, 8000);
    void (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !mapEl.current || map.current) return;
        const start = defaultValue ?? bias ?? NIGERIA_CENTER;
        const zoom = defaultValue ? 17 : bias ? 14 : 6;
        const m = L.map(mapEl.current, { zoomControl: true, attributionControl: true }).setView(
          [start.lat, start.lng],
          zoom,
        );
        const dark = document.documentElement.dataset.theme === "dark";
        addBaseTiles(L, m, dark, {
          onLoad: () => {
            mapDrew.current = true;
            setMapFailed(false);
          },
          onFail: () => setMapFailed(true),
        });
        m.on("movestart", () => setMoving(true));
        m.on("moveend", () => {
          setMoving(false);
          const c = m.getCenter();
          setTouched(true);
          setCenter({ lat: c.lat, lng: c.lng });
        });
        map.current = m;
      } catch {
        setMapFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(watchdog);
      map.current?.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The map container stays mounted while hidden; redraw it when it comes back.
  useEffect(() => {
    if (!showManual) setTimeout(() => map.current?.invalidateSize(), 60);
  }, [showManual]);

  // Recentre when the bias (e.g. selected campus) changes and nothing was picked yet.
  useEffect(() => {
    if (!bias || touched || !map.current) return;
    map.current.setView([bias.lat, bias.lng], 14);
  }, [bias?.lat, bias?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reverse geocode the pin after the map stops moving.
  useEffect(() => {
    if (!center || !touched) return;
    if (skipReverse.current) {
      const p = skipReverse.current;
      skipReverse.current = null;
      setAddress(p.label);
      setMeta({ city: p.city, state: p.state });
      return;
    }
    if (defaultValue && center.lat === defaultValue.lat && center.lng === defaultValue.lng) return;
    let cancelled = false;
    setResolving(true);
    const t = setTimeout(async () => {
      const p = await reverseGeocode(center);
      if (cancelled) return;
      setAddress(p.label);
      setMeta({ city: p.city, state: p.state });
      setResolving(false);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [center]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!onChange) return;
    if (center && address) {
      onChange({ ...center, label: address, ...meta });
    } else if (showManual && allowApproximate && address.trim() && bias) {
      // Typed by hand with no pin: use the campus centre so the form can still be completed.
      onChange({ lat: bias.lat, lng: bias.lng, label: address.trim(), approximate: true });
    } else {
      onChange(null);
    }
  }, [center, address, meta, showManual, allowApproximate, bias?.lat, bias?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced autocomplete.
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
        const near = map.current
          ? { lat: map.current.getCenter().lat, lng: map.current.getCenter().lng }
          : bias;
        setResults(await searchPlaces(q, near, ctrl.signal));
      } catch {
        // aborted / offline
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
    skipReverse.current = p;
    setQuery("");
    setResults([]);
    setOpen(false);
    setTouched(true);
    if (map.current) map.current.flyTo([p.lat, p.lng], 17, { duration: 0.6 });
    else setCenter({ lat: p.lat, lng: p.lng });
  }

  function locateMe() {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError("Your browser can't share location. Search or drag the map instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setTouched(true);
        map.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 17, { duration: 0.6 });
      },
      () => setGeoError("Location permission was blocked. Search or drag the map instead."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (results[0]) choose(results[0]);
                }
              }}
              placeholder="Search street, area or landmark"
              className="h-11 w-full rounded-2xl px-3 pl-9 text-sm text-fg outline-none"
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            onClick={locateMe}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl border border-border bg-surface px-3 text-sm font-medium text-fg hover:border-accent"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M12 2 4.5 20.3l.7.7L12 18l6.8 3 .7-.7z" />
            </svg>
            <span className="hidden sm:inline">Use my location</span>
          </button>
        </div>

        {open && query.trim().length >= 2 ? (
          <div className="absolute left-0 right-0 top-12 z-[1000] max-h-72 overflow-y-auto rounded-2xl border border-border bg-bg shadow-xl">
            {searching && !results.length ? (
              <p className="px-4 py-3 text-sm text-muted">Searching…</p>
            ) : results.length ? (
              results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(p)}
                  className="flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-surface"
                >
                  <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-xs">
                    📍
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-fg">{p.title}</span>
                    {p.subtitle ? (
                      <span className="block truncate text-xs text-muted">{p.subtitle}</span>
                    ) : null}
                  </span>
                </button>
              ))
            ) : (
              <p className="px-4 py-3 text-sm text-muted">
                No places found. Try a nearby landmark or street.
              </p>
            )}
          </div>
        ) : null}
      </div>

      <div
        className={`relative h-64 overflow-hidden rounded-2xl border border-border bg-surface sm:h-72 ${
          showManual ? "hidden" : ""
        }`}
      >
        <div ref={mapEl} className="absolute inset-0 z-0" />
        <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center">
          <div
            className="flex flex-col items-center transition-transform duration-150"
            style={{ transform: `translateY(${moving ? -32 : -24}px)` }}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-white bg-inverse-bg shadow-lg">
              <span className="h-2.5 w-2.5 rounded-full bg-accent" />
            </span>
            <span className="-mt-px h-3 w-[3px] rounded bg-inverse-bg" />
          </div>
        </div>
        {!touched ? (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[500] rounded-xl bg-bg/90 px-3 py-2 text-center text-xs text-muted shadow">
            Search above or drag the map to put the pin on the exact spot.
          </div>
        ) : null}
      </div>
      {geoError ? <p className="text-xs text-danger">{geoError}</p> : null}

      {mapFailed ? (
        <p className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted">
          The map couldn&apos;t load on this connection, so just type the address below. You can still use the search box
          above to attach exact coordinates.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setManual((v) => !v)}
          className="text-xs font-medium text-muted underline underline-offset-2 hover:text-fg"
        >
          {manual ? "Use the map instead" : "Map not working? Enter the address yourself"}
        </button>
      )}
      {showManual && allowApproximate && !center ? (
        <p className="text-xs text-muted">
          Without a pin we place you near your campus centre for now. You can set the exact spot later when the map works.
        </p>
      ) : null}

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-fg">{addressLabel}</label>
        <input
          name={names.address}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required={required}
          placeholder={
            resolving
              ? "Getting address…"
              : showManual
                ? "Type the street, area and town, e.g. 12 Market Road, Bodija, Ibadan"
                : "Pick a spot on the map, or type the address"
          }
          className="h-11 w-full rounded-2xl px-3 text-sm text-fg outline-none"
        />
        <p className="text-xs text-muted">{addressHint}</p>
      </div>
      <input type="hidden" name={names.lat} value={center && touched ? String(center.lat) : ""} />
      <input type="hidden" name={names.lng} value={center && touched ? String(center.lng) : ""} />
    </div>
  );
}
