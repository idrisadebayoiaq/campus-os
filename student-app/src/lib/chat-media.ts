import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabase";

export const CHAT_BUCKET = "chat-files";
export const MAX_VIDEO_MS = 3 * 60 * 1000;
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export type AttachmentKind = "image" | "video" | "audio" | "file";

export type Attachment = {
  id: string;
  message_id: string;
  kind: AttachmentKind;
  path: string;
  name: string | null;
  mime: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
};

/** A file the student picked but has not uploaded yet. */
export type PickedFile = {
  uri: string;
  kind: AttachmentKind;
  name: string;
  mime: string;
  size: number | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
};

export class MediaError extends Error {}

function extOf(name: string, mime: string) {
  const fromName = name.includes(".") ? name.split(".").pop() : "";
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  const fromMime = mime.split("/")[1];
  return (fromMime || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 5).toLowerCase() || "bin";
}

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function fromImageAsset(a: ImagePicker.ImagePickerAsset): PickedFile {
  const video = a.type === "video";
  const mime = a.mimeType || (video ? "video/mp4" : "image/jpeg");
  return {
    uri: a.uri,
    kind: video ? "video" : "image",
    name: a.fileName || `${video ? "video" : "photo"}.${extOf("", mime)}`,
    mime,
    size: a.fileSize ?? null,
    width: a.width,
    height: a.height,
    durationMs: video ? (a.duration ?? null) : null,
  };
}

/** Checks the size and length limits. Throws a message the student can read. */
export function checkLimits(f: PickedFile) {
  if (f.kind === "video") {
    if (f.durationMs != null && f.durationMs > MAX_VIDEO_MS) throw new MediaError("Videos can be up to 3 minutes long.");
    if (f.size != null && f.size > MAX_MEDIA_BYTES) throw new MediaError("That video is over 50 MB.");
  } else if (f.kind === "image") {
    if (f.size != null && f.size > MAX_MEDIA_BYTES) throw new MediaError("That photo is over 50 MB.");
  } else if (f.size != null && f.size > MAX_FILE_BYTES) {
    throw new MediaError("Files can be up to 25 MB.");
  }
}

/** Photos and videos from the gallery. Returns [] if the student cancels. */
export async function pickFromLibrary(): Promise<PickedFile[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new MediaError("Allow photo access in Settings to attach photos and videos.");
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    allowsMultipleSelection: true,
    selectionLimit: 10,
    quality: 0.8,
    videoMaxDuration: 180,
  });
  if (res.canceled) return [];
  return res.assets.map(fromImageAsset);
}

export async function pickFromCamera(): Promise<PickedFile[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new MediaError("Allow camera access in Settings to take a photo.");
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images", "videos"],
    quality: 0.8,
    videoMaxDuration: 180,
  });
  if (res.canceled) return [];
  return res.assets.map(fromImageAsset);
}

export async function pickDocuments(): Promise<PickedFile[]> {
  const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: "*/*" });
  if (res.canceled) return [];
  return res.assets.map((a) => ({
    uri: a.uri,
    kind: "file" as const,
    name: a.name || "file",
    mime: a.mimeType || "application/octet-stream",
    size: a.size ?? null,
  }));
}

export async function currentPlace(): Promise<{ lat: number; lng: number; label: string | null }> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) throw new MediaError("Allow location access in Settings to share where you are.");
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  let label: string | null = null;
  try {
    const [p] = await Location.reverseGeocodeAsync(pos.coords);
    label = [p?.name, p?.street, p?.city].filter(Boolean).join(", ") || null;
  } catch {
    label = null;
  }
  return { lat: pos.coords.latitude, lng: pos.coords.longitude, label };
}

/** Location messages keep their pin in the body: `geo:lat,lng|label`. */
export function encodeLocation(p: { lat: number; lng: number; label: string | null }) {
  return `geo:${p.lat.toFixed(6)},${p.lng.toFixed(6)}${p.label ? `|${p.label}` : ""}`;
}

export function decodeLocation(body: string): { lat: number; lng: number; label: string | null } | null {
  const m = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:\|(.*))?$/s.exec(body);
  if (!m) return null;
  return { lat: Number(m[1]), lng: Number(m[2]), label: m[3] || null };
}

/** Uploads one picked file into the chat's private folder and returns what send_message needs. */
export async function uploadChatFile(conversationId: string, f: PickedFile) {
  checkLimits(f);
  const path = `${conversationId}/${uuid()}.${extOf(f.name, f.mime)}`;
  const form = new FormData();
  form.append("file", { uri: f.uri, name: f.name, type: f.mime } as unknown as Blob);
  const { error } = await supabase.storage.from(CHAT_BUCKET).upload(path, form, { contentType: f.mime, upsert: false });
  if (error) throw new MediaError(error.message || "Upload failed");
  return {
    kind: f.kind,
    path,
    name: f.name,
    mime: f.mime,
    size_bytes: f.size,
    width: f.width ?? null,
    height: f.height ?? null,
    duration_ms: f.durationMs ?? null,
  };
}

/** Copies an already-uploaded file into another chat, for forwarding. */
export async function copyToChat(att: Pick<Attachment, "path" | "name" | "mime" | "size_bytes" | "kind" | "width" | "height" | "duration_ms">, targetConversation: string) {
  const path = `${targetConversation}/${uuid()}.${extOf(att.name || att.path, att.mime || "")}`;
  const { error } = await supabase.storage.from(CHAT_BUCKET).copy(att.path, path);
  if (error) throw new MediaError(error.message || "Couldn't forward the file");
  return {
    kind: att.kind,
    path,
    name: att.name,
    mime: att.mime,
    size_bytes: att.size_bytes,
    width: att.width,
    height: att.height,
    duration_ms: att.duration_ms,
  };
}

const urlCache = new Map<string, { url: string; expires: number }>();
const TTL_SECONDS = 3600;

/** Signed links for private chat files, cached for most of an hour. */
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now();
  const out: Record<string, string> = {};
  const need: string[] = [];
  for (const p of paths) {
    const hit = urlCache.get(p);
    if (hit && hit.expires > now) out[p] = hit.url;
    else need.push(p);
  }
  if (need.length) {
    const { data } = await supabase.storage.from(CHAT_BUCKET).createSignedUrls(need, TTL_SECONDS);
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) {
        urlCache.set(row.path, { url: row.signedUrl, expires: now + (TTL_SECONDS - 300) * 1000 });
        out[row.path] = row.signedUrl;
      }
    }
  }
  return out;
}

export function useSignedUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(() => (path ? (urlCache.get(path)?.url ?? null) : null));
  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    void signedUrls([path]).then((m) => {
      if (!cancelled) setUrl(m[path] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return url;
}

export function formatBytes(n: number | null | undefined) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDuration(ms: number | null | undefined) {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
