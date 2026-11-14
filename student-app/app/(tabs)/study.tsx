import { StyleSheet, View } from "react-native";
import { AppText, EmptyState, Screen } from "@/src/components/ui";

export default function StudyScreen() {
  return (
    <Screen>
      <View style={styles.content}>
        <AppText size={22} weight="700">
          Study Hub
        </AppText>
        <AppText muted>
          Courses, timetable, CGPA, and AI tutor are on the website first. Mobile
          parity comes next.
        </AppText>
        <EmptyState
          title="Coming in the next build"
          description="Open CampusOS on the web for Study Hub tools today."
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingVertical: 16 },
});
