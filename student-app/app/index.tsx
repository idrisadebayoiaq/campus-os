import { Redirect } from "expo-router";
import { View } from "react-native";
import { useAuth } from "@/src/lib/auth";

export default function Index() {
  const { session, loading } = useAuth();
  if (loading) return <View style={{ flex: 1, backgroundColor: "#3C315B" }} />;
  return <Redirect href={session ? "/(tabs)" : "/(auth)/login"} />;
}
