import { Image, type ImageSourcePropType } from "react-native";

export type AiAvatarPreset = {
  key: string;
  name: string;
  source: ImageSourcePropType;
};

/** Built-in AI tutor avatars. The database only accepts these keys. */
export const AI_AVATARS: AiAvatarPreset[] = [
  { key: "preset:ai-1", name: "Byte", source: require("@/assets/ai-avatars/ai-1.jpg") },
  { key: "preset:ai-2", name: "Professor Owl", source: require("@/assets/ai-avatars/ai-2.jpg") },
  { key: "preset:ai-3", name: "Nova", source: require("@/assets/ai-avatars/ai-3.jpg") },
  { key: "preset:ai-4", name: "Reader Fox", source: require("@/assets/ai-avatars/ai-4.jpg") },
  { key: "preset:ai-5", name: "Spark", source: require("@/assets/ai-avatars/ai-5.jpg") },
  { key: "preset:ai-6", name: "Astro", source: require("@/assets/ai-avatars/ai-6.jpg") },
  { key: "preset:ai-7", name: "Lofi Cat", source: require("@/assets/ai-avatars/ai-7.jpg") },
  { key: "preset:ai-8", name: "Orb", source: require("@/assets/ai-avatars/ai-8.jpg") },
];

export const DEFAULT_AI_AVATAR = AI_AVATARS[0];

export function aiAvatarFor(key: string | null | undefined) {
  return AI_AVATARS.find((a) => a.key === key) ?? DEFAULT_AI_AVATAR;
}

export function AiAvatar({
  avatarKey,
  size = 44,
}: {
  avatarKey: string | null | undefined;
  size?: number;
}) {
  return (
    <Image
      source={aiAvatarFor(avatarKey).source}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  );
}
