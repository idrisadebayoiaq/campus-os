import * as ImagePicker from "expo-image-picker";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Lets the user choose a photo and uploads it as evidence for a marketplace order. Returns the storage path. */
export async function pickAndUploadEvidence(supabase: SupabaseClient, orderId: string, userId: string): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6 });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  const ext = a.mimeType?.includes("png") ? "png" : "jpg";
  const path = `${orderId}/${userId}/${Date.now()}.${ext}`;
  const buf = await (await fetch(a.uri)).arrayBuffer();
  const { error } = await supabase.storage.from("market-evidence").upload(path, buf, { contentType: a.mimeType ?? `image/${ext === "jpg" ? "jpeg" : ext}` });
  if (error) throw new Error(error.message);
  return path;
}
