import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { useAuth } from "@/src/lib/auth";
import { useTheme } from "@/src/theme/ThemeProvider";

function TabLabel({ title, focused }: { title: string; focused: boolean }) {
  const colors = useTheme();
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: focused ? "600" : "500",
        color: focused ? colors.fg : colors.muted,
      }}
    >
      {title}
    </Text>
  );
}

export default function TabsLayout() {
  const { session, loading } = useAuth();
  const colors = useTheme();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator color={colors.fg} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.fg,
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.fg,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarLabel: ({ focused }) => (
            <TabLabel title="Home" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="housing"
        options={{
          title: "Housing",
          tabBarLabel: ({ focused }) => (
            <TabLabel title="Housing" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="study"
        options={{
          title: "Study",
          tabBarLabel: ({ focused }) => (
            <TabLabel title="Study" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Inbox",
          tabBarLabel: ({ focused }) => (
            <TabLabel title="Inbox" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarLabel: ({ focused }) => (
            <TabLabel title="Profile" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
