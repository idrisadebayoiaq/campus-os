import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  Vibration,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, Button } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";

/**
 * Payment password (6 digits, checked on the server) + optional fingerprint (this phone only).
 * - the wallet screens ask for it when opened (and again after 2 quiet minutes),
 * - every payment, top-up and withdrawal asks for it (Premium is the one exception).
 */

const PIN_LENGTH = 6;
const WALLET_GRACE_MS = 2 * 60 * 1000;
const RECENT_MS = 45 * 1000;

type Mode = "auth" | "setup" | "change" | "reset";
type Step = "enter" | "account" | "create" | "confirm" | "bio";

type Request = { mode: Mode; reason: string; resolve: (ok: boolean) => void };

type Ctx = {
  ready: boolean;
  hasPin: boolean;
  biometric: boolean;
  bioAvailable: boolean;
  hidden: boolean;
  setHidden: (v: boolean) => void;
  toggleHidden: () => void;
  /** Ask before moving money. Resolves true once the user proved it is them. */
  confirm: (reason: string, opts?: { allowRecent?: boolean }) => Promise<boolean>;
  unlockWallet: () => Promise<boolean>;
  walletUnlockedNow: () => boolean;
  openSetup: () => Promise<boolean>;
  changePin: () => Promise<boolean>;
  setBiometric: (on: boolean) => Promise<boolean>;
};

const PayAuthContext = createContext<Ctx | null>(null);

export function usePayAuth() {
  const ctx = useContext(PayAuthContext);
  if (!ctx) throw new Error("usePayAuth must be used inside PayAuthProvider");
  return ctx;
}

/** "₦ ••••" while the balance is hidden. */
export function maskNaira(amount: number, hidden: boolean) {
  return hidden ? "₦ ••••" : formatNaira(amount);
}

const EASY = new Set(["123456", "654321", "012345", "123123", "121212"]);
function easyPin(pin: string) {
  return /^(\d)\1{5}$/.test(pin) || EASY.has(pin);
}

async function bioSupported() {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

async function bioPrompt(message: string) {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: message,
      cancelLabel: "Use payment password",
      disableDeviceFallback: true,
    });
    return res.success;
  } catch {
    return false;
  }
}

export function PayAuthProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [ready, setReady] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [biometric, setBiometricState] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [hidden, setHiddenState] = useState(false);
  const [req, setReq] = useState<Request | null>(null);
  const reqRef = useRef<Request | null>(null);
  const lastAuth = useRef(0);

  const refresh = useCallback(async () => {
    if (!uid) {
      setReady(false);
      setHasPin(false);
      return false;
    }
    const [{ data }, bio, hide, avail] = await Promise.all([
      supabase.rpc("payment_pin_status"),
      AsyncStorage.getItem(`campusos.payBio.${uid}`),
      AsyncStorage.getItem(`campusos.hideBalance.${uid}`),
      bioSupported(),
    ]);
    const has = !!(data as { has_pin?: boolean } | null)?.has_pin;
    setHasPin(has);
    setBioAvailable(avail);
    setBiometricState(avail && bio === "1");
    setHiddenState(hide === "1");
    setReady(true);
    return has;
  }, [uid]);

  useEffect(() => {
    lastAuth.current = 0;
    void refresh();
  }, [refresh]);

  const setHidden = useCallback(
    (v: boolean) => {
      setHiddenState(v);
      if (uid) void AsyncStorage.setItem(`campusos.hideBalance.${uid}`, v ? "1" : "0");
    },
    [uid],
  );

  const run = useCallback((mode: Mode, reason: string) => {
    return new Promise<boolean>((resolve) => {
      if (reqRef.current) {
        resolve(false);
        return;
      }
      const next: Request = {
        mode,
        reason,
        resolve: (ok) => {
          reqRef.current = null;
          setReq(null);
          if (ok) lastAuth.current = Date.now();
          resolve(ok);
        },
      };
      reqRef.current = next;
      setReq(next);
    });
  }, []);

  const authenticate = useCallback(
    async (reason: string) => {
      const has = ready ? hasPin : await refresh();
      return run(has ? "auth" : "setup", reason);
    },
    [hasPin, ready, refresh, run],
  );

  const confirm = useCallback<Ctx["confirm"]>(
    async (reason, opts) => {
      if (opts?.allowRecent && hasPin && Date.now() - lastAuth.current < RECENT_MS) return true;
      return authenticate(reason);
    },
    [authenticate, hasPin],
  );

  const walletUnlockedNow = useCallback(() => Date.now() - lastAuth.current < WALLET_GRACE_MS, []);

  const unlockWallet = useCallback(async () => {
    if (walletUnlockedNow()) return true;
    return authenticate("Open your wallet");
  }, [authenticate, walletUnlockedNow]);

  const openSetup = useCallback(async () => {
    const ok = await run("setup", "Create your payment password");
    if (ok) await refresh();
    return ok;
  }, [refresh, run]);

  const changePin = useCallback(async () => {
    const ok = await run("change", "Change your payment password");
    if (ok) await refresh();
    return ok;
  }, [refresh, run]);

  const setBiometric = useCallback(
    async (on: boolean) => {
      if (!uid) return false;
      if (on) {
        if (!(await bioSupported())) return false;
        if (!hasPin && !(await run("setup", "Create your payment password"))) return false;
        if (!(await bioPrompt("Confirm your fingerprint to turn it on"))) return false;
        await AsyncStorage.setItem(`campusos.payBio.${uid}`, "1");
        setBiometricState(true);
        await refresh();
        return true;
      }
      if (!(await run("auth", "Turn off fingerprint"))) return false;
      await AsyncStorage.setItem(`campusos.payBio.${uid}`, "0");
      setBiometricState(false);
      return true;
    },
    [hasPin, refresh, run, uid],
  );

  const value = useMemo<Ctx>(
    () => ({
      ready,
      hasPin,
      biometric,
      bioAvailable,
      hidden,
      setHidden,
      toggleHidden: () => setHidden(!hidden),
      confirm,
      unlockWallet,
      walletUnlockedNow,
      openSetup,
      changePin,
      setBiometric,
    }),
    [ready, hasPin, biometric, bioAvailable, hidden, setHidden, confirm, unlockWallet, walletUnlockedNow, openSetup, changePin, setBiometric],
  );

  return (
    <PayAuthContext.Provider value={value}>
      {children}
      {req ? (
        <FlowModal
          key={`${req.mode}-${req.reason}`}
          req={req}
          biometric={biometric}
          bioAvailable={bioAvailable}
          onBiometricOn={async () => {
            if (!uid) return;
            await AsyncStorage.setItem(`campusos.payBio.${uid}`, "1");
            setBiometricState(true);
          }}
          email={user?.email ?? ""}
        />
      ) : null}
    </PayAuthContext.Provider>
  );
}

/** Use on wallet screens: shows a lock panel until the user passes the check. */
export function useWalletGate() {
  const { unlockWallet, walletUnlockedNow, ready } = usePayAuth();
  const [open, setOpen] = useState(() => walletUnlockedNow());
  const asking = useRef(false);

  const unlock = useCallback(async () => {
    if (asking.current) return false;
    asking.current = true;
    const ok = await unlockWallet();
    asking.current = false;
    setOpen(ok);
    return ok;
  }, [unlockWallet]);

  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      if (walletUnlockedNow()) {
        setOpen(true);
        return;
      }
      setOpen(false);
      void unlock();
    }, [ready, unlock, walletUnlockedNow]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && !walletUnlockedNow()) {
        setOpen(false);
        void unlock();
      }
    });
    return () => sub.remove();
  }, [unlock, walletUnlockedNow]);

  return { open: open && ready, unlock };
}

export function WalletLocked({ onUnlock }: { onUnlock: () => void }) {
  const colors = useTheme();
  return (
    <View style={styles.locked}>
      <View style={[styles.lockIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name="lock-closed" size={30} color={colors.fg} />
      </View>
      <AppText size={18} weight="700">
        Wallet locked
      </AppText>
      <AppText muted style={{ textAlign: "center" }}>
        Enter your payment password or use your fingerprint to see your wallet.
      </AppText>
      <Button title="Unlock wallet" onPress={onUnlock} />
    </View>
  );
}

// ---------------------------------------------------------------------------------------------

function PinPad({
  value,
  onChange,
  onBio,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onBio?: () => void;
  disabled?: boolean;
}) {
  const colors = useTheme();
  const press = (d: string) => {
    if (disabled || value.length >= PIN_LENGTH) return;
    onChange(value + d);
  };
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "bio", "0", "del"];
  return (
    <View style={{ gap: 28, alignItems: "center" }}>
      <View style={styles.dots}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.pinDot,
              { borderColor: colors.fg, backgroundColor: i < value.length ? colors.fg : "transparent" },
            ]}
          />
        ))}
      </View>
      <View style={styles.pad}>
        {keys.map((k) => {
          if (k === "bio") {
            return onBio ? (
              <Pressable key={k} onPress={onBio} style={styles.key} accessibilityLabel="Use fingerprint">
                <Ionicons name="finger-print" size={32} color={colors.fg} />
              </Pressable>
            ) : (
              <View key={k} style={styles.key} />
            );
          }
          if (k === "del") {
            return (
              <Pressable
                key={k}
                onPress={() => !disabled && onChange(value.slice(0, -1))}
                onLongPress={() => !disabled && onChange("")}
                style={styles.key}
                accessibilityLabel="Delete"
              >
                <Ionicons name="backspace-outline" size={26} color={colors.fg} />
              </Pressable>
            );
          }
          return (
            <Pressable
              key={k}
              onPress={() => press(k)}
              style={({ pressed }) => [styles.key, pressed && { backgroundColor: colors.accentSoft }]}
              accessibilityLabel={k}
            >
              <AppText size={26} weight="600">
                {k}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function FlowModal({
  req,
  biometric,
  bioAvailable,
  onBiometricOn,
  email,
}: {
  req: Request;
  biometric: boolean;
  bioAvailable: boolean;
  onBiometricOn: () => Promise<void>;
  email: string;
}) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>(req.mode);
  const [step, setStep] = useState<Step>(req.mode === "setup" ? "create" : req.mode === "reset" ? "account" : "enter");
  const [pin, setPin] = useState("");
  const [first, setFirst] = useState("");
  const [current, setCurrent] = useState("");
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoTried = useRef(false);

  const fail = (msg: string) => {
    setError(msg);
    setPin("");
    Vibration.vibrate(60);
  };

  const tryBio = useCallback(async () => {
    const ok = await bioPrompt(req.reason);
    if (ok) req.resolve(true);
  }, [req]);

  // Fingerprint first when it is on; the keypad stays one tap away.
  useEffect(() => {
    if (autoTried.current) return;
    autoTried.current = true;
    if (req.mode === "auth" && biometric) void tryBio();
  }, [biometric, req.mode, tryBio]);

  async function onPin(code: string) {
    if (busy) return;
    setError(null);
    if (step === "enter") {
      setBusy(true);
      const { data, error: e } = await supabase.rpc("verify_payment_pin", { p_pin: code });
      setBusy(false);
      const r = (data ?? {}) as { ok?: boolean; reason?: string; remaining?: number };
      if (e) return fail("Couldn't check it. Check your connection and try again.");
      if (r.ok) {
        if (mode === "change") {
          setCurrent(code);
          setPin("");
          setStep("create");
        } else req.resolve(true);
        return;
      }
      if (r.reason === "locked") return fail("Too many wrong tries. Try again in 15 minutes, or reset it with your account password.");
      return fail(`Wrong payment password. ${r.remaining ?? 0} ${r.remaining === 1 ? "try" : "tries"} left.`);
    }
    if (step === "create") {
      if (easyPin(code)) return fail("Too easy to guess. Avoid repeated digits or runs like 123456.");
      setFirst(code);
      setPin("");
      setStep("confirm");
      return;
    }
    if (step === "confirm") {
      if (code !== first) {
        setFirst("");
        setStep("create");
        return fail("Those didn't match. Start again.");
      }
      setBusy(true);
      const res =
        mode === "reset"
          ? await supabase.rpc("reset_payment_pin", { p_pin: code })
          : await supabase.rpc("set_payment_pin", { p_pin: code, p_current: mode === "change" ? current : null });
      setBusy(false);
      if (res.error) return fail(res.error.message);
      setPin("");
      if (mode === "setup" && bioAvailable && !biometric) {
        setStep("bio");
        return;
      }
      req.resolve(true);
    }
  }

  async function checkAccount() {
    if (!email || !account || busy) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.signInWithPassword({ email, password: account });
    setBusy(false);
    if (e) {
      setError("That account password isn't right.");
      return;
    }
    setAccount("");
    setStep("create");
  }

  async function enableFingerprint() {
    if (await bioPrompt("Confirm your fingerprint to turn it on")) await onBiometricOn();
    req.resolve(true);
  }

  const title =
    step === "enter"
      ? mode === "change"
        ? "Current payment password"
        : req.reason
      : step === "account"
        ? "Confirm it's you"
        : step === "create"
          ? mode === "change" || mode === "reset"
            ? "New payment password"
            : "Create your payment password"
          : step === "confirm"
            ? "Confirm payment password"
            : "Use your fingerprint too?";
  const sub =
    step === "enter"
      ? mode === "change"
        ? "Enter the one you use now."
        : "Enter your payment password."
      : step === "account"
        ? "Enter your CampusOS account password to reset your payment password."
        : step === "create"
          ? `Choose ${PIN_LENGTH} digits. You'll use them to open your wallet and approve payments.`
          : step === "confirm"
            ? "Enter the same digits again."
            : "Skip typing next time. Your payment password still works as a backup.";

  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={() => req.resolve(false)}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.head}>
          <Pressable onPress={() => req.resolve(false)} hitSlop={12} style={[styles.close, { backgroundColor: colors.surface }]} accessibilityLabel="Close">
            <Ionicons name="close" size={20} color={colors.fg} />
          </Pressable>
        </View>

        <View style={styles.body}>
          <View style={[styles.lockIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name={step === "bio" ? "finger-print" : "lock-closed"} size={28} color={colors.fg} />
          </View>
          <AppText size={20} weight="700" style={{ textAlign: "center" }}>
            {title}
          </AppText>
          <AppText muted style={{ textAlign: "center", paddingHorizontal: 12 }}>
            {sub}
          </AppText>

          {step === "account" ? (
            <View style={{ alignSelf: "stretch", gap: 14, marginTop: 8 }}>
              <View style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                <TextInput
                  value={account}
                  onChangeText={setAccount}
                  placeholder="Account password"
                  placeholderTextColor={colors.muted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{ color: colors.fg, fontSize: 16, paddingVertical: 12 }}
                  onSubmitEditing={() => void checkAccount()}
                />
              </View>
              <Button title="Continue" onPress={() => void checkAccount()} loading={busy} disabled={!account} />
            </View>
          ) : step === "bio" ? (
            <View style={{ alignSelf: "stretch", gap: 10, marginTop: 12 }}>
              <Button title="Turn on fingerprint" onPress={() => void enableFingerprint()} />
              <Button title="Not now" variant="secondary" onPress={() => req.resolve(true)} />
            </View>
          ) : (
            <View style={{ marginTop: 18 }}>
              <PinPad
                value={pin}
                disabled={busy}
                onChange={(v) => {
                  setPin(v);
                  if (v.length === PIN_LENGTH) void onPin(v);
                }}
                onBio={step === "enter" && mode === "auth" && biometric ? () => void tryBio() : undefined}
              />
            </View>
          )}

          <View style={{ minHeight: 44, justifyContent: "center", alignItems: "center" }}>
            {busy && step !== "account" ? <ActivityIndicator color={colors.fg} /> : null}
            {error ? (
              <AppText size={13} weight="600" style={{ color: colors.danger, textAlign: "center" }}>
                {error}
              </AppText>
            ) : null}
          </View>

          {step === "enter" && mode === "auth" ? (
            <Pressable
              onPress={() => {
                setMode("reset");
                setStep("account");
                setPin("");
                setError(null);
              }}
              hitSlop={10}
            >
              <AppText size={14} weight="600" style={{ color: colors.accent }}>
                Forgot payment password?
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  locked: { alignItems: "center", gap: 12, paddingVertical: 48, paddingHorizontal: 12 },
  lockIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  head: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 16 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, alignItems: "center", gap: 10, paddingHorizontal: 24, paddingTop: 8 },
  dots: { flexDirection: "row", gap: 16 },
  pinDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5 },
  pad: { width: 276, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8 },
  key: { width: 84, height: 62, borderRadius: 31, alignItems: "center", justifyContent: "center" },
  input: { borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, minHeight: 52, justifyContent: "center" },
});
