import { Switch } from "react-native";
import { Group, ListRow, Notice, PageShell, Section } from "@/src/components/page";
import { toast } from "@/src/lib/feedback";
import { usePayAuth } from "@/src/lib/pay-auth";
import { useTheme } from "@/src/theme/ThemeProvider";

/** Payment password, fingerprint and the hide-balance switch. */
export default function PaymentSecurityScreen() {
  const colors = useTheme();
  const { ready, hasPin, biometric, bioAvailable, hidden, setHidden, openSetup, changePin, setBiometric } = usePayAuth();

  async function setup() {
    if (await openSetup()) toast.success("Payment password set");
  }

  async function change() {
    if (await changePin()) toast.success("Payment password changed");
  }

  async function flipBio(on: boolean) {
    const ok = await setBiometric(on);
    if (ok) toast.success(on ? "Fingerprint is on" : "Fingerprint is off");
  }

  return (
    <PageShell title="Payment security" subtitle="Protect your wallet and every payment" loading={!ready}>
      {!hasPin ? (
        <Notice tone="warn" icon="lock-open-outline">
          Set a payment password to open your wallet and pay for things. It takes a few seconds.
        </Notice>
      ) : null}

      <Section title="Unlock">
        <Group>
          <ListRow
            icon="keypad-outline"
            title="Payment password"
            subtitle={hasPin ? "6 digits, asked when you open the wallet and pay" : "Not set yet"}
            value={hasPin ? "Change" : "Set up"}
            onPress={() => void (hasPin ? change() : setup())}
          />
          <ListRow
            icon="finger-print-outline"
            title="Fingerprint"
            subtitle={
              !bioAvailable
                ? "Add a fingerprint in your phone's settings first"
                : "Use your fingerprint instead of typing the password"
            }
            chevron={false}
            right={
              <Switch
                value={biometric}
                disabled={!bioAvailable}
                onValueChange={(v) => void flipBio(v)}
                trackColor={{ true: colors.accent, false: colors.border }}
              />
            }
          />
        </Group>
      </Section>

      <Section title="Privacy">
        <Group>
          <ListRow
            icon={hidden ? "eye-off-outline" : "eye-outline"}
            title="Hide wallet balance"
            subtitle="Shows ₦ •••• on the wallet, home and profile. Tap the eye on your wallet card to switch quickly."
            chevron={false}
            numberOfLines={3}
            right={<Switch value={hidden} onValueChange={setHidden} trackColor={{ true: colors.accent, false: colors.border }} />}
          />
        </Group>
      </Section>

      <Notice icon="shield-checkmark-outline">
        The payment password is needed to open your wallet, pay for food, marketplace items and rent, add money, and withdraw. Premium is the only payment that doesn't ask.
      </Notice>
      <Notice icon="alert-circle-outline">Five wrong tries lock it for 15 minutes. Forgot it? Tap "Forgot payment password" on the keypad and confirm your account password.</Notice>
    </PageShell>
  );
}
