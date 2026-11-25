import { useState } from "react";
import { Linking, View } from "react-native";
import { AppText, Button, Card, Field, Input } from "@/src/components/ui";
import { StudyShell, SyncBanner } from "@/src/components/study";
import { useAuth } from "@/src/lib/auth";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

const SUPPORT_EMAIL = "support@campusos.app";

export default function SupportScreen() {
  const colors = useTheme();
  const { user } = useAuth();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    const body = message.trim();
    if (!body) {
      setError("Write a short message so we can help.");
      return;
    }
    setLoading(true);
    setStatus(null);
    setError(null);
    try {
      const { error: insErr } = await supabase.from("support_tickets").insert({
        user_id: user?.id || null,
        email: user?.email || null,
        subject: subject.trim() || "App support",
        message: body,
        source: "student_app",
      });
      if (insErr) {
        const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
          subject.trim() || "CampusOS support",
        )}&body=${encodeURIComponent(body)}`;
        await Linking.openURL(mailto);
        setStatus("Opened your email app to contact support.");
      } else {
        setSubject("");
        setMessage("");
        setStatus("Ticket sent. We'll reply by email.");
      }
    } catch {
      setError("Could not send right now. Try email instead.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <StudyShell
      title="Contact support"
      subtitle="Housing, study tools, or account help"
      banner={<SyncBanner error={error} notice={status} />}
    >
      <View
        style={{
          backgroundColor: colors.heroBg,
          borderRadius: radii.xl,
          padding: 20,
          gap: 6,
        }}
      >
        <AppText size={13} style={{ color: colors.heroMuted }}>
          We’re here to help
        </AppText>
        <AppText size={18} weight="700" style={{ color: colors.heroFg }}>
          Send a message and we’ll follow up
        </AppText>
      </View>

      <Card style={{ gap: 12 }}>
        <Field label="Subject">
          <Input
            value={subject}
            onChangeText={setSubject}
            placeholder="e.g. Housing listing issue"
          />
        </Field>
        <Field label="Message">
          <Input
            value={message}
            onChangeText={setMessage}
            placeholder="Describe what you need…"
            multiline
            style={{ height: 140, paddingTop: 12, textAlignVertical: "top" }}
          />
        </Field>
        <Button title="Send" onPress={submit} loading={loading} />
        <Button
          title="Email support"
          variant="secondary"
          onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
        />
      </Card>
    </StudyShell>
  );
}
