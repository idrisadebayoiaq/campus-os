"use client";

import "leaflet/dist/leaflet.css";
import type { Circle, LayerGroup, Map as LeafletMap, Marker } from "leaflet";
import { useEffect, useRef } from "react";

export type MapZone = { id: string; label: string; radius_km: number; is_active: boolean };

/** Offset a point east by `km` (good enough for delivery-sized distances). */
function eastOf(lat: number, lng: number, km: number) {
  const dLng = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  return { lat, lng: lng + dLng };
}

/**
 * Shows the kitchen pin with a ring for every delivery zone. The dashed ring has a
 * handle you drag to choose the radius of the zone you're about to add.
 */
export function DeliveryMap({
  center,
  zones,
  draftKm,
  onDraftKm,
}: {
  center: { lat: number; lng: number };
  zones: MapZone[];
  draftKm: number;
  onDraftKm: (km: number) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const rings = useRef<LayerGroup | null>(null);
  const draft = useRef<Circle | null>(null);
  const handle = useRef<Marker | null>(null);
  const leaflet = useRef<typeof import("leaflet") | null>(null);
  const onDraft = useRef(onDraftKm);
  onDraft.current = onDraftKm;

  // Build the map once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current || map.current) return;
      leaflet.current = L;
      const m = L.map(el.current, { zoomControl: true }).setView([center.lat, center.lng], 14);
      const dark = document.documentElement.dataset.theme === "dark";
      L.tileLayer(
        `https://{s}.basemaps.cartocdn.com/${dark ? "dark_all" : "rastertiles/voyager"}/{z}/{x}/{y}{r}.png`,
        { subdomains: "abcd", maxZoom: 20, attribution: "&copy; OpenStreetMap &copy; CARTO" },
      ).addTo(m);
      L.circleMarker([center.lat, center.lng], { radius: 7, color: "#111", weight: 2, fillColor: "#fff", fillOpacity: 1 })
        .bindTooltip("Your kitchen")
        .addTo(m);
      rings.current = L.layerGroup().addTo(m);

      const km = Math.max(0.1, draftKm);
      draft.current = L.circle([center.lat, center.lng], {
        radius: km * 1000,
        color: "#2563eb",
        weight: 2,
        dashArray: "6 6",
        fillOpacity: 0.06,
      }).addTo(m);
      const pos = eastOf(center.lat, center.lng, km);
      handle.current = L.marker([pos.lat, pos.lng], {
        draggable: true,
        icon: L.divIcon({
          className: "",
          html: '<div style="width:18px;height:18px;border-radius:9px;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 1px #2563eb"></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
      }).addTo(m);
      handle.current.on("drag", () => {
        const p = handle.current!.getLatLng();
        const dist = m.distance([center.lat, center.lng], p) / 1000;
        const km2 = Math.min(50, Math.max(0.1, Math.round(dist * 10) / 10));
        draft.current?.setRadius(km2 * 1000);
        onDraft.current(km2);
      });
      handle.current.on("dragend", () => {
        const km2 = draft.current ? draft.current.getRadius() / 1000 : km;
        const pos2 = eastOf(center.lat, center.lng, km2);
        handle.current?.setLatLng([pos2.lat, pos2.lng]);
      });
      map.current = m;
      redrawRings();
      m.fitBounds(draft.current.getBounds(), { padding: [30, 30] });
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function redrawRings() {
    const L = leaflet.current;
    if (!L || !rings.current) return;
    rings.current.clearLayers();
    for (const z of zones) {
      L.circle([center.lat, center.lng], {
        radius: Number(z.radius_km) * 1000,
        color: z.is_active ? "#16a34a" : "#9ca3af",
        weight: 2,
        fillOpacity: 0.05,
      })
        .bindTooltip(`${z.label} · ${Number(z.radius_km)} km`, { sticky: true })
        .addTo(rings.current);
    }
  }

  useEffect(redrawRings, [zones]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the dashed ring in step with the typed radius.
  useEffect(() => {
    if (!draft.current || !handle.current) return;
    const km = Math.max(0.1, draftKm);
    if (Math.abs(draft.current.getRadius() / 1000 - km) < 0.001) return;
    draft.current.setRadius(km * 1000);
    const pos = eastOf(center.lat, center.lng, km);
    handle.current.setLatLng([pos.lat, pos.lng]);
  }, [draftKm]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="h-72 w-full overflow-hidden rounded-2xl border border-border" />;
}
