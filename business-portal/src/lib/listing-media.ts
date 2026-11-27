import { createClient } from "@/lib/supabase/client";

export type MediaRowBasics = {
  id: string;
  url: string;
  kind: "image" | "video";
  is_cover: boolean;
};

export type MediaTarget = {
  /** column on listing_media that points at the thing being decorated */
  column: "property_id" | "unit_id" | "menu_item_id" | "market_listing_id";
  id: string;
  /** units also store their property so ownership checks work */
  propertyId?: string;
};

export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

/** Downscale big photos in the browser so uploads are fast on slow connections. */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 1.2 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function extensionOf(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;
  return file.type.split("/")[1] ?? "bin";
}

/** Keep the single-image column in step with the cover so older screens still show a picture. */
export async function syncCoverImage(target: MediaTarget, rows: MediaRowBasics[]) {
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

/**
 * Uploads the photos and videos picked on a "new listing" form once the listing exists.
 * The first photo becomes the cover. Returns how many files went up and the error text for any that did not.
 */
export async function uploadNewMedia(
  userId: string,
  target: MediaTarget,
  files: File[],
): Promise<{ uploaded: number; photos: number; errors: string[] }> {
  const supabase = createClient();
  const added: MediaRowBasics[] = [];
  const errors: string[] = [];
  let coverTaken = false;

  // Decide the cover up front so parallel uploads can't both claim it.
  const jobs = files.map((file, index) => {
    const isVideo = file.type.startsWith("video/");
    const wantsCover = !isVideo && !coverTaken;
    if (wantsCover) coverTaken = true;
    return { file, index, isVideo, wantsCover };
  });

  const queue = [...jobs];
  const worker = async () => {
    while (queue.length) {
      const job = queue.shift();
      if (!job) return;
      try {
        const prepared = job.isVideo ? job.file : await compressImage(job.file);
        if (prepared.size > MAX_MEDIA_BYTES) throw new Error(`${job.file.name} is larger than 50 MB.`);
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
          kind: job.isVideo ? "video" : "image",
          sort_order: job.index,
          is_cover: job.wantsCover,
        };
        if (target.column === "unit_id" && target.propertyId) row.property_id = target.propertyId;
        const { data, error: insertError } = await supabase
          .from("listing_media")
          .insert(row)
          .select("id, url, kind, is_cover")
          .single();
        if (insertError) {
          await supabase.storage.from("listing-media").remove([path]);
          throw new Error(insertError.message);
        }
        added.push(data as MediaRowBasics);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : `${job.file.name} did not upload.`);
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  // If the planned cover failed, promote the first photo that did upload.
  if (added.length && !added.some((m) => m.is_cover)) {
    const first = added.find((m) => m.kind === "image");
    if (first) {
      await supabase.from("listing_media").update({ is_cover: true }).eq("id", first.id);
      first.is_cover = true;
    }
  }
  await syncCoverImage(target, added);
  return { uploaded: added.length, photos: added.filter((m) => m.kind === "image").length, errors };
}
