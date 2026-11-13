"use client";

type Props = {
  lat?: number | null;
  lng?: number | null;
  label?: string;
  className?: string;
};

export function MapPin({ lat, lng, label = "Approximate location", className = "" }: Props) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!lat || !lng || !token) {
    return (
      <div className={`rounded-md border border-border bg-surface p-4 text-sm text-muted ${className}`}>
        Map unavailable{!token ? " (Mapbox token missing)" : ""}.
        {lat && lng ? ` Pin: ${lat.toFixed(4)}, ${lng.toFixed(4)}` : ""}
      </div>
    );
  }

  const src = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+000000(${lng},${lat})/${lng},${lat},14,0/640x320@2x?access_token=${token}`;

  return (
    <div className={`overflow-hidden rounded-md border border-border ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={label} className="h-48 w-full object-cover" />
      <p className="border-t border-border bg-surface px-3 py-2 text-xs text-muted">
        {label} — exact inspection address stays private until a viewing is arranged.
      </p>
    </div>
  );
}
