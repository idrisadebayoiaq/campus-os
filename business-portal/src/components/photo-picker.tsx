"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm";

/**
 * Choose photos and videos on a "new listing" form. Nothing uploads yet: the files go up as soon as the
 * listing is saved. The first photo is the cover (use "Make cover" to change it).
 */
export function PhotoPicker({
  files,
  onChange,
  title = "Photos",
  hint,
  required = false,
  minPhotos = 0,
  max = 20,
  disabled = false,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  title?: string;
  hint?: string;
  required?: boolean;
  minPhotos?: number;
  max?: number;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file), video: file.type.startsWith("video/") })),
    [files],
  );
  useEffect(() => {
    return () => previews.forEach((p) => URL.revokeObjectURL(p.url));
  }, [previews]);

  const photoCount = files.filter((f) => f.type.startsWith("image/")).length;
  const missing = Math.max(0, minPhotos - photoCount);

  function add(list: FileList | File[]) {
    const incoming = Array.from(list).filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (!incoming.length) {
      setNote("Choose photos (JPG, PNG, WebP) or videos (MP4, MOV, WebM).");
      return;
    }
    const tooBig = incoming.filter((f) => f.size > 50 * 1024 * 1024);
    const ok = incoming.filter((f) => f.size <= 50 * 1024 * 1024);
    const room = Math.max(0, max - files.length);
    const next = [...files, ...ok.slice(0, room)];
    setNote(
      tooBig.length
        ? `${tooBig.length} file${tooBig.length === 1 ? " was" : "s were"} skipped because ${tooBig.length === 1 ? "it is" : "they are"} over 50 MB.`
        : ok.length > room
          ? `You can add up to ${max} files.`
          : null,
    );
    onChange(next);
  }

  function makeCover(index: number) {
    const next = [...files];
    const [picked] = next.splice(index, 1);
    onChange([picked, ...next]);
  }

  const firstPhotoIndex = files.findIndex((f) => f.type.startsWith("image/"));

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">
            {title}
            {required ? <span className="text-danger"> *</span> : null}
          </h3>
          <p className="text-xs text-muted">
            {photoCount} photo{photoCount === 1 ? "" : "s"}
            {files.length - photoCount ? ` · ${files.length - photoCount} video${files.length - photoCount === 1 ? "" : "s"}` : ""}
            {hint ? ` · ${hint}` : ""}
          </p>
        </div>
        {missing > 0 ? (
          <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold">
            Add {missing} more photo{missing === 1 ? "" : "s"} to publish
          </span>
        ) : null}
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled && event.dataTransfer.files.length) add(event.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition ${
          dragging ? "border-accent bg-accent-soft" : "border-border bg-bg"
        }`}
      >
        <p className="text-sm font-medium">Drag photos here or choose from your device</p>
        <p className="text-xs text-muted">JPG, PNG, WebP, MP4, MOV, WebM · up to 50 MB each</p>
        <button
          type="button"
          disabled={disabled || files.length >= max}
          onClick={() => inputRef.current?.click()}
          className="mt-1 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-on-accent hover:opacity-90 disabled:opacity-50"
        >
          Choose photos
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) add(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {note ? <p className="text-xs text-danger">{note}</p> : null}

      {previews.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {previews.map((p, index) => (
            <li key={`${p.file.name}-${index}`} className="overflow-hidden rounded-2xl border border-border bg-bg">
              <div className="relative aspect-[4/3] bg-surface">
                {p.video ? (
                  <video src={p.url} className="h-full w-full object-cover" muted playsInline />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt="" className="h-full w-full object-cover" />
                )}
                {index === firstPhotoIndex ? (
                  <span className="absolute left-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-on-accent">
                    COVER
                  </span>
                ) : null}
                {p.video ? (
                  <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">
                    VIDEO
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-1 p-2 text-[11px] font-semibold">
                {!p.video && index !== firstPhotoIndex ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => makeCover(index)}
                    className="rounded-full border border-border px-2 py-1 hover:bg-surface"
                  >
                    Make cover
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(files.filter((_, i) => i !== index))}
                  className="ml-auto rounded-full px-2 py-1 text-danger hover:bg-surface"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
