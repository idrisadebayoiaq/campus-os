import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    if (Platform.OS === "web") {
      return AsyncStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS === "web") {
      return AsyncStorage.setItem(key, value);
    }
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => {
    if (Platform.OS === "web") {
      return AsyncStorage.removeItem(key);
    }
    return SecureStore.deleteItemAsync(key);
  },
};

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  anonKey || "placeholder",
  {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
