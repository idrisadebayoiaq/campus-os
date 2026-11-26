import { Ionicons } from "@expo/vector-icons";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewNavigation } from "react-native-webview";
import { AppText, Button } from "@/src/components/ui";
import { formatNaira } from "@/src/lib/campus";
import { callPaystack } from "@/src/lib/payments";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

/**
 * Card payments without leaving the app.
 * The card form is Paystack's own secure page, shown inside a sheet that slides up from the
 * bottom. Card numbers are typed into Paystack's form, never into CampusOS, so no card data
 * touches our app or servers. When the payment ends the sheet shows the result and closes.
 */

/** Paystack sends the buyer here when a card payment succeeds. We catch it before it loads. */
export const PAY_RETURN_URL = `${(process.env.EXPO_PUBLIC_STUDENT_WEB_URL || "https://campusos-app.vercel.app").replace(/\/$/, "")}/pay-return`;

export type PayOptions = {
  url: string;
  reference: string;
  title: string;
  amount?: number;
  successText?: string;
};

export type PayResult = { status: "success" | "failed" | "pending" | "cancelled"; reference: string };

type Ctx = { payByCard: (options: PayOptions) => Promise<PayResult> };

const PayContext = createContext<Ctx>({
  payByCard: async (o) => ({ status: "cancelled", reference: o.reference }),
});

export const usePaySheet = () => useContext(PayContext);

type Phase = "checkout" | "checking" | "result";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function PaySheetProvider({ children }: { children: ReactNode }) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [options, setOptions] = useState<PayOptions | null>(null);
  const [phase, setPhase] = useState<Phase>("checkout");
  const [result, setResult] = useState<PayResult | null>(null);
  const [loading, setLoading] = useState(true);
  const resolver = useRef<((r: PayResult) => void) | null>(null);
  const finishing = useRef(false);

  const payByCard = useCallback((o: PayOptions) => {
    return new Promise<PayResult>((resolve) => {
      resolver.current = resolve;
      finishing.current = false;
      setResult(null);
      setLoading(true);
      setPhase("checkout");
      setOptions(o);
    });
  }, []);

  function close(r: PayResult) {
    setOptions(null);
    const done = resolver.current;
    resolver.current = null;
    done?.(r);
  }

  /** Asks the server what happened with this payment (it settles the money when it succeeded). */
  async function confirm(o: PayOptions, attempts: number): Promise<PayResult["status"]> {
    for (let i = 0; i < attempts; i++) {
      const res = await callPaystack(supabase, { action: "verify", reference: o.reference });
      if (res.ok) {
        const status = String(res.data.status ?? "");
        if (status === "success") return "success";
        if (status === "failed" || status === "reversed") return "failed";
      }
      if (i < attempts - 1) await sleep(1600);
    }
    return "pending";
  }

  async function finish(fromReturn: boolean): Promise<void> {
    if (!options || finishing.current) return;
    finishing.current = true;
    setPhase("checking");
    const status = await confirm(options, fromReturn ? 8 : 1);
    if (status === "pending" && !fromReturn) {
      // The buyer closed the sheet before paying.
      close({ status: "cancelled", reference: options.reference });
      return;
    }
    setResult({ status, reference: options.reference });
    setPhase("result");
  }

  function onNavigate(nav: { url: string }): boolean {
    const url = nav.url || "";
    if (url.startsWith(PAY_RETURN_URL)) {
      void finish(true);
      return false;
    }
    if (/paystack\.(com|co)\/close/i.test(url)) {
      void finish(false);
      return false;
    }
    return /^(https?:|about:)/i.test(url);
  }

  const value = useMemo(() => ({ payByCard }), [payByCard]);
  const open = options !== null;

  return (
    <PayContext.Provider value={value}>
      {children}
      <Modal
        visible={open}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => {
          if (phase === "checkout") void finish(false);
          else if (phase === "result" && result) close(result);
        }}
      >
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={[styles.sheet, { backgroundColor: colors.bg, paddingBottom: Math.max(insets.bottom, 8) }]}>
            <View style={styles.grabber}>
              <View style={[styles.grabberBar, { backgroundColor: colors.border }]} />
            </View>

            <View style={styles.header}>
              <View style={[styles.lock, { backgroundColor: colors.surface }]}>
                <Ionicons name="lock-closed" size={18} color={colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText weight="700" size={16} numberOfLines={1}>
                  {options?.title ?? "Pay by card"}
                </AppText>
                <AppText muted size={12}>
                  {options?.amount != null ? `${formatNaira(options.amount)} · ` : ""}Secure checkout by Paystack
                </AppText>
              </View>
              {phase === "checkout" ? (
                <Pressable
                  onPress={() => void finish(false)}
                  hitSlop={10}
                  accessibilityLabel="Close payment"
                  style={[styles.closeBtn, { backgroundColor: colors.surface }]}
                >
                  <Ionicons name="close" size={20} color={colors.fg} />
                </Pressable>
              ) : null}
            </View>

            {phase === "checkout" && options ? (
              <View style={{ flex: 1 }}>
                <WebView
                  source={{ uri: options.url }}
                  style={{ flex: 1, backgroundColor: colors.bg }}
                  originWhitelist={["https://*", "http://*"]}
                  javaScriptEnabled
                  domStorageEnabled
                  thirdPartyCookiesEnabled
                  setSupportMultipleWindows={false}
                  onShouldStartLoadWithRequest={(req) => onNavigate(req)}
                  onNavigationStateChange={(nav: WebViewNavigation): void => {
                    if (nav.url?.startsWith(PAY_RETURN_URL)) void finish(true);
                  }}
                  onLoadEnd={() => setLoading(false)}
                  onError={() => setLoading(false)}
                />
                {loading ? (
                  <View style={[styles.loading, { backgroundColor: colors.bg }]}>
                    <ActivityIndicator color={colors.fg} />
                    <AppText muted size={13}>
                      Opening secure card form…
                    </AppText>
                  </View>
                ) : null}
              </View>
            ) : null}

            {phase === "checking" ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.fg} />
                <AppText weight="700" size={17}>
                  Confirming your payment…
                </AppText>
                <AppText muted size={13} style={{ textAlign: "center" }}>
                  Please wait a moment. Don't close the app.
                </AppText>
              </View>
            ) : null}

            {phase === "result" && result && options ? <ResultView result={result} options={options} onDone={() => close(result)} /> : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </PayContext.Provider>
  );
}

function ResultView({ result, options, onDone }: { result: PayResult; options: PayOptions; onDone: () => void }) {
  const colors = useTheme();
  const ok = result.status === "success";
  const pending = result.status === "pending";
  const tint = ok ? colors.success : pending ? colors.warn : colors.danger;
  const icon: keyof typeof Ionicons.glyphMap = ok ? "checkmark-circle" : pending ? "time" : "close-circle";
  const title = ok ? "Payment successful" : pending ? "Still confirming" : "Payment not completed";
  const body = ok
    ? options.successText ?? "Thank you. Your payment went through."
    : pending
      ? "We haven't heard back from your bank yet. If you were charged, it will show in your account shortly. You don't need to pay again."
      : "Your card was not charged. Check your card details or try another card.";
  return (
    <View style={styles.center}>
      <View style={[styles.resultIcon, { backgroundColor: tint + "22" }]}>
        <Ionicons name={icon} size={48} color={tint} />
      </View>
      <AppText weight="700" size={22} style={{ textAlign: "center" }}>
        {title}
      </AppText>
      <AppText muted size={14} style={{ textAlign: "center", paddingHorizontal: 12 }}>
        {body}
      </AppText>
      {options.amount != null ? (
        <View style={[styles.amountPill, { backgroundColor: colors.surface }]}>
          <AppText weight="700">{formatNaira(options.amount)}</AppText>
        </View>
      ) : null}
      <View style={{ alignSelf: "stretch", paddingHorizontal: 20, marginTop: 10 }}>
        <Button title={ok ? "Done" : "Close"} onPress={onDone} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    height: "90%",
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    overflow: "hidden",
  },
  grabber: { alignItems: "center", paddingTop: 8 },
  grabberBar: { width: 40, height: 4, borderRadius: 2 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
  lock: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  loading: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  resultIcon: { width: 92, height: 92, borderRadius: 46, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  amountPill: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: radii.pill },
});
