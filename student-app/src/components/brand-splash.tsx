import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  AppState,
  BackHandler,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/lib/auth";

const LOGO = require("@/assets/icon.png");
const MIN_SPLASH_MS = 1200;
/** Android only shows its icon-only splash when it relaunches the app, so ours follows it. */
const RELAUNCH_AFTER_MS = 10 * 60 * 1000;

/**
 * The branded launch screen. It covers whatever screen the app opens on
 * (home, a notification link, a restored screen), so every launch looks the same.
 */
export function BrandSplash() {
  const { loading } = useAuth();
  const insets = useSafeAreaInsets();
  const [run, setRun] = useState(1);
  const [visible, setVisible] = useState(true);
  const [minElapsed, setMinElapsed] = useState(false);
  const logo = useRef(new Animated.Value(0)).current;
  const text = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let leftAt = 0;
    let exiting = false;
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      exiting = !router.canGoBack();
      return false;
    });
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "background") {
        leftAt = Date.now();
        return;
      }
      if (s !== "active" || !leftAt) return;
      const relaunch = exiting || Date.now() - leftAt >= RELAUNCH_AFTER_MS;
      exiting = false;
      leftAt = 0;
      if (relaunch) setRun((n) => n + 1);
    });
    return () => {
      back.remove();
      sub.remove();
    };
  }, []);

  useEffect(() => {
    setVisible(true);
    setMinElapsed(false);
    logo.setValue(0);
    text.setValue(0);
    bar.setValue(0);
    fade.setValue(1);
    Animated.sequence([
      Animated.spring(logo, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }),
      Animated.timing(text, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
    const loop = Animated.loop(
      Animated.timing(bar, {
        toValue: 1,
        duration: 1100,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    );
    loop.start();
    const t = setTimeout(() => setMinElapsed(true), MIN_SPLASH_MS);
    return () => {
      clearTimeout(t);
      loop.stop();
    };
  }, [run, logo, text, bar, fade]);

  useEffect(() => {
    if (!visible || loading || !minElapsed) return;
    Animated.timing(fade, {
      toValue: 0,
      duration: 260,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => setVisible(false));
  }, [visible, loading, minElapsed, fade]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.root, { opacity: fade }]}>
      <StatusBar style="light" />
      <View style={[styles.ring, styles.ringA]} />
      <View style={[styles.ring, styles.ringB]} />

      <View style={styles.center}>
        <Animated.View
          style={{
            opacity: logo,
            transform: [
              { scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
            ],
          }}
        >
          <Image source={LOGO} style={styles.logo} />
        </Animated.View>
        <Animated.View
          style={{
            alignItems: "center",
            opacity: text,
            transform: [
              { translateY: text.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
            ],
          }}
        >
          <Text style={styles.wordmark}>CampusOS</Text>
          <Text style={styles.tagline}>Your whole campus, in one app</Text>
        </Animated.View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 36 }]}>
        <View style={styles.track}>
          <Animated.View
            style={[
              styles.thumb,
              {
                transform: [
                  { translateX: bar.interpolate({ inputRange: [0, 1], outputRange: [-48, 120] }) },
                ],
              },
            ]}
          />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: "#3C315B",
    overflow: "hidden",
  },
  ring: { position: "absolute", borderRadius: 999, backgroundColor: "#AB9FF2" },
  ringA: { width: 420, height: 420, top: -160, right: -160, opacity: 0.14 },
  ringB: { width: 300, height: 300, bottom: -120, left: -120, opacity: 0.1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 22 },
  logo: { width: 116, height: 116 },
  wordmark: { color: "#FFFFFF", fontSize: 34, fontWeight: "800", letterSpacing: -0.6 },
  tagline: { color: "rgba(255,255,255,0.72)", fontSize: 15, marginTop: 6 },
  footer: { alignItems: "center" },
  track: {
    width: 120,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.16)",
    overflow: "hidden",
  },
  thumb: { width: 48, height: 4, borderRadius: 2, backgroundColor: "#AB9FF2" },
});
