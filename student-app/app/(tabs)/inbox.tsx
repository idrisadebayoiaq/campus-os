import { StyleSheet, View } from "react-native";
import { AppText, EmptyState, Screen } from "@/src/components/ui";

export default function InboxScreen() {
  return (
    <Screen>
      <View style={styles.content}>
        <AppText size={22} weight="700">
          Inbox
        </AppText>
        <AppText muted>
          Housing enquiries and support chats will sync here after the housing
          actions pass.
        </AppText>
        <EmptyState
          title="Coming in the next build"
          description="Use the CampusOS website inbox for messaging right now."
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingVertical: 16 },
});
