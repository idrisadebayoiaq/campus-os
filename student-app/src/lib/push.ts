import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import { onBeforeSignOut, useAuth } from "@/src/lib/auth";
import { supabase } from "@/src/lib/supabase";

let openConversation: string | null = null;
let currentToken: string | null = null;

/** The chat on screen right now; its pushes are not shown as banners. */
export function setOpenConversation(id: string | null) {
  openConversation = id;
}

Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const conv = n.request.content.data?.conversation_id;
    const quiet = typeof conv === "string" && conv === openConversation;
    return {
      shouldShowBanner: !quiet,
      shouldShowList: !quiet,
      shouldPlaySound: !quiet,
      shouldSetBadge: false,
    };
  },
});

async function ensureChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("campusos_default", {
    name: "CampusOS",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 120, 200],
    lightColor: "#5B4B8A",
    sound: "default",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

async function saveToken(token: string) {
  currentToken = token;
  await supabase.rpc("register_push_token", {
    p_token: token,
    p_platform: Platform.OS,
    p_device: Device.modelName ?? null,
  });
}

// After sign-out this phone stops getting the old account's pushes.
onBeforeSignOut(async () => {
  if (!currentToken) return;
  await supabase.rpc("unregister_push_token", { p_token: currentToken });
});

function openLink(request: Notifications.NotificationRequest) {
  // System-shown FCM notifications carry their data on the trigger's remote message.
  const remote = (request.trigger as { remoteMessage?: { data?: Record<string, unknown> } } | null)?.remoteMessage;
  const data = { ...(remote?.data ?? {}), ...(request.content.data ?? {}) };
  const link = typeof data.link === "string" && data.link.startsWith("/") ? data.link : "/notifications";
  router.push(link as never);
}

/** Registers this phone for push while someone is signed in, and opens tapped notifications. */
export function usePushNotifications() {
  const { user } = useAuth();
  const handledResponse = useRef<string | null>(null);
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!user || Platform.OS === "web") return;
    let cancelled = false;
    void (async () => {
      try {
        await ensureChannel();
        let { status } = await Notifications.getPermissionsAsync();
        if (status !== "granted") {
          ({ status } = await Notifications.requestPermissionsAsync());
        }
        if (status !== "granted" || cancelled) return;
        const { data } = await Notifications.getDevicePushTokenAsync();
        if (!cancelled && typeof data === "string" && data) await saveToken(data);
      } catch {
        // Emulators without Play Services have no token; nothing else to do.
      }
    })();
    const sub = Notifications.addPushTokenListener(({ data }) => {
      if (typeof data === "string" && data) void saveToken(data);
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [user]);

  useEffect(() => {
    if (!user || !lastResponse) return;
    const id = lastResponse.notification.request.identifier;
    if (handledResponse.current === id) return;
    handledResponse.current = id;
    if (lastResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    // Give the navigator a moment to mount on a cold start.
    setTimeout(() => openLink(lastResponse.notification.request), 300);
  }, [user, lastResponse]);
}
