"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type MediaRow = {
  id: string;
  url: string;
  kind: "image" | "video";
  caption: string | null;
  is_cover: boolean;
  sort_order: number;
  storage_path: string | null;
};

export type MediaTarget = {
  /** column on listing_media that points at the thing being decorated */
  column: "property_id" | "unit_id" | "menu_item_id" | "market_listing_id";
  id: string;
  /** units also store their property so ownership checks work */
  propertyId?: string;
};

const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm";

type Upload = { name: string; state: "uploading" | "done" | "error"; message?: string };

/** Downscale big photos in the browser so uploads are fast on slow connections. */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 1.2 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function extensionOf(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;
  return file.type.split("/")[1] ?? "bin";
}

/** Keep the single-image column in step with the cover so older screens still show a picture. */
async function syncCoverImage(target: MediaTarget, rows: MediaRow[]) {
  const table =
    target.column === "menu_item_id"
      ? "menu_items"
      : target.column === "market_listing_id"
        ? "marketplace_listings"
        : null;
  if (!table) return;
  const images = rows.filter((m) => m.kind === "image");
  const cover = images.find((m) => m.is_cover) ?? images[0] ?? null;
  const supabase = createClient();
  await supabase.from(table).update({ image_url: cover?.url ?? null }).eq("id", target.id);
}

export function MediaManager({
  userId,
  target,
  initial,
  title = "Photos & videos",
  hint,
  minPhotos = 0,
}: {
  userId: string;
  target: MediaTarget;
  initial: MediaRow[];
  title?: string;
  hint?: string;
  minPhotos?: number;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<MediaRow[]>(() =>
    [...initial].sort((a, b) => a.sort_order - b.sort_order),
  );
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const photoCount = items.filter((m) => m.kind === "image").length;

  async function uploadOne(file: File, index: number, startOrder: number, isFirstImage: boolean) {
    const supabase = createClient();
    const isVideo = file.type.startsWith("video/");
    const prepared = isVideo ? file : await compressImage(file);
    if (prepared.size > MAX_BYTES) {
      throw new Error(`${file.name} is larger than 50 MB.`);
    }
    const path = `${userId}/${target.id}/${crypto.randomUUID()}.${extensionOf(prepared)}`;
    const { error: uploadError } = await supabase.storage
      .from("listing-media")
      .upload(path, prepared, { contentType: prepared.type, upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const { data: publicUrl } = supabase.storage.from("listing-media").getPublicUrl(path);
    const row: Record<string, unknown> = {
      [target.column]: target.id,
      url: publicUrl.publicUrl,
      storage_path: path,
      kind: isVideo ? "video" : "image",
      sort_order: startOrder + index,
      is_cover: !isVideo && isFirstImage,
    };
    if (target.column === "unit_id" && target.propertyId) row.property_id = target.propertyId;

    const { data, error: insertError } = await supabase
      .from("listing_media")
      .insert(row)
      .select("id, url, kind, caption, is_cover, sort_order, storage_path")
      .single();
    if (insertError) {
      await supabase.storage.from("listing-media").remove([path]);
      throw new Error(insertError.message);
    }
    return data as MediaRow;
  }

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
    );
    if (!files.length) {
      setError("Choose photos (JPG, PNG, WebP) or videos (MP4, MOV, WebM).");
      return;
    }
    setError(null);
    setUploads(files.map((f) => ({ name: f.name, state: "uploading" })));

    const startOrder = items.length ? Math.max(...items.map((m) => m.sort_order)) + 1 : 0;
    const hasCover = items.some((m) => m.is_cover);
    let firstImageUsed = hasCover;
    const added: MediaRow[] = [];

    // Upload a few at a time so many photos don't stall the browser.
    const queue = files.map((file, index) => ({ file, index }));
    const worker = async () => {
      while (queue.length) {
        const job = queue.shift();
        if (!job) return;
        const wantsCover = !firstImageUsed && job.file.type.startsWith("image/");
        if (wantsCover) firstImageUsed = true;
        try {
          const row = await uploadOne(job.file, job.index, startOrder, wantsCover);
          added.push(row);
          setItems((prev) => [...prev, row].sort((a, b) => a.sort_order - b.sort_order));
          setUploads((prev) =>
            prev.map((u, i) => (i === job.index ? { ...u, state: "done" } : u)),
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : "Upload failed";
          setUploads((prev) =>
            prev.map((u, i) => (i === job.index ? { ...u, state: "error", message } : u)),
          );
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    await syncCoverImage(target, [...items, ...added]);
    router.refresh();
    setTimeout(() => setUploads((prev) => prev.filter((u) => u.state === "error")), 2500);
  }

  async function remove(row: MediaRow) {
    const supabase = createClient();
    setError(null);
    const { error: deleteError } = await supabase.from("listing_media").delete().eq("id", row.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    if (row.storage_path) {
      await supabase.storage.from("listing-media").remove([row.storage_path]);
    }
    let next = items.filter((m) => m.id !== row.id);
    if (row.is_cover) {
      const nextCover = next.find((m) => m.kind === "image");
      if (nextCover) {
        await supabase.from("listing_media").update({ is_cover: true }).eq("id", nextCover.id);
        next = next.map((m) => (m.id === nextCover.id ? { ...m, is_cover: true } : m));
      }
    }
    setItems(next);
    await syncCoverImage(target, next);
    router.refresh();
  }

  async function makeCover(row: MediaRow) {
    const supabase = createClient();
    await supabase.from("listing_media").update({ is_cover: false }).eq(target.column, target.id);
    const { error: coverError } = await supabase
      .from("listing_media")
      .update({ is_cover: true })
      .eq("id", row.id);
    if (coverError) {
      setError(coverError.message);
      return;
    }
    const next = items.map((m) => ({ ...m, is_cover: m.id === row.id }));
    setItems(next);
    await syncCoverImage(target, next);
    router.refresh();
  }

  async function move(row: MediaRow, direction: -1 | 1) {
    const index = items.findIndex((m) => m.id === row.id);
    const other = items[index + direction];
    if (!other) return;
    const supabase = createClient();
    const [a, b] = [row.sort_order, other.sort_order];
    const swapA = a === b ? a + direction : b;
    await Promise.all([
      supabase.from("listing_media").update({ sort_order: swapA }).eq("id", row.id),
      supabase.from("listing_media").update({ sort_order: a }).eq("id", other.id),
    ]);
    setItems((prev) =>
      prev
        .map((m) =>
          m.id === row.id ? { ...m, sort_order: swapA } : m.id === other.id ? { ...m, sort_order: a } : m,
        )
        .sort((x, y) => x.sort_order - y.sort_order),
    );
  }

  async function saveCaption(row: MediaRow, caption: string) {
    if ((row.caption ?? "") === caption) return;
    const supabase = createClient();
    await supabase.from("listing_media").update({ caption: caption || null }).eq("id", row.id);
    setItems((prev) => prev.map((m) => (m.id === row.id ? { ...m, caption: caption || null } : m)));
  }

  const missing = Math.max(0, minPhotos - photoCount);

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-xs text-muted">
            {photoCount} photo{photoCount === 1 ? "" : "s"} ·{" "}
            {items.length - photoCount} video{items.length - photoCount === 1 ? "" : "s"}
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
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer.files.length) void handleFiles(event.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition ${
          dragging ? "border-accent bg-accent-soft" : "border-border bg-bg"
        }`}
      >
        <p className="text-sm font-medium">Drag photos and videos here</p>
        <p className="text-xs text-muted">
          Upload as many as you like · JPG, PNG, WebP, MP4, MOV, WebM · up to 50 MB each
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-1 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-on-accent hover:opacity-90"
        >
          Choose files
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) void handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {uploads.length ? (
        <ul className="space-y-1 text-xs">
          {uploads.map((u, i) => (
            <li key={`${u.name}-${i}`} className="flex items-center justify-between gap-3">
              <span className="truncate">{u.name}</span>
              <span
                className={
                  u.state === "error"
                    ? "text-danger"
                    : u.state === "done"
                      ? "text-success"
                      : "text-muted"
                }
              >
                {u.state === "uploading" ? "Uploading…" : u.state === "done" ? "Done" : u.message}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {items.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((row, index) => (
            <li key={row.id} className="overflow-hidden rounded-2xl border border-border bg-bg">
              <div className="relative aspect-[4/3] bg-surface">
                {row.kind === "video" ? (
                  <video src={row.url} className="h-full w-full object-cover" muted playsInline controls />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.url} alt={row.caption ?? ""} className="h-full w-full object-cover" />
                )}
                {row.is_cover ? (
                  <span className="absolute left-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-on-accent">
                    COVER
                  </span>
                ) : null}
                {row.kind === "video" ? (
                  <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">
                    VIDEO
                  </span>
                ) : null}
              </div>
              <div className="space-y-2 p-2">
                <input
                  defaultValue={row.caption ?? ""}
                  onBlur={(event) => void saveCaption(row, event.target.value.trim())}
                  placeholder="Caption (optional)"
                  className="h-8 w-full rounded-full border border-border bg-bg px-3 text-xs outline-none focus:border-accent"
                />
                <div className="flex flex-wrap items-center gap-1 text-[11px] font-semibold">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => void move(row, -1)}
                    className="rounded-full border border-border px-2 py-1 disabled:opacity-30"
                    aria-label="Move earlier"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    disabled={index === items.length - 1}
                    onClick={() => void move(row, 1)}
                    className="rounded-full border border-border px-2 py-1 disabled:opacity-30"
                    aria-label="Move later"
                  >
                    →
                  </button>
                  {row.kind === "image" && !row.is_cover ? (
                    <button
                      type="button"
                      onClick={() => void makeCover(row)}
                      className="rounded-full border border-border px-2 py-1 hover:bg-surface"
                    >
                      Set cover
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void remove(row)}
                    className="ml-auto rounded-full px-2 py-1 text-danger hover:bg-surface"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
