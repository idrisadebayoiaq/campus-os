import { Redirect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/lib/auth";

const LOGO = require("@/assets/icon.png");
const MIN_SPLASH_MS = 1200;

export default function Index() {
  const { session, loading } = useAuth();
  const insets = useSafeAreaInsets();
  const [minElapsed, setMinElapsed] = useState(false);
  const logo = useRef(new Animated.Value(0)).current;
  const text = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(logo, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }),
      Animated.timing(text, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
    Animated.loop(
      Animated.timing(bar, {
        toValue: 1,
        duration: 1100,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ).start();
    const t = setTimeout(() => setMinElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, [logo, text, bar]);

  if (!loading && minElapsed) {
    return <Redirect href={session ? "/(tabs)" : "/(auth)/login"} />;
  }

  return (
    <View style={styles.root}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#3C315B", overflow: "hidden" },
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
