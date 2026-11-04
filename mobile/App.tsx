import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { addDays, createPlanner, distanceLabel, generateWeek, selectDays } from "@/features/running-programs/domain";
import type { PlannerState, Profile } from "@/features/running-programs/types";
import { MESSAGES } from "@/features/i18n/messages";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/features/i18n/locales";
import { STORAGE_KEY } from "@/features/running-programs/storage";
import { ApiError, isRateLimited, mobileApi } from "./src/api";
import { AuthProvider, useAuth } from "./src/auth";
import { NATIVE_STRINGS } from "./src/locale";
import { LocaleProvider, useLocale } from "./src/locale-context";
import { useGarmin } from "./src/garmin";
import { PENDING_ACCOUNT_KEY, usePlanner } from "./src/planner";
import { SetupForm } from "./src/SetupForm";
import { WeekView } from "./src/WeekView";
import {
  Body, Button, ButtonRow, Card, ChoiceGroup, Heading, ModalSheet, Notice, Page, SectionTitle, TextField, colors,
} from "./src/components";

const LOCALE_KEY = "run-week-locale";

function stripCredentials(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripCredentials);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/(token|secret|credential|authorization|password)/i.test(key))
    .map(([key, item]) => [key, stripCredentials(item)]));
}

function NativeApp() {
  const auth = useAuth();
  const { locale, setLocale, resetLocale, storageError } = useLocale();
  const t = MESSAGES[locale];
  const native = NATIVE_STRINGS[locale];
  const planner = usePlanner(auth.token);
  const weekStart = planner.state?.currentWeek.startDate ?? null;
  const garmin = useGarmin(auth.token, weekStart);
  const [accountMenu, setAccountMenu] = useState(false);
  const [languageMenu, setLanguageMenu] = useState(false);
  const [signInModal, setSignInModal] = useState(false);
  const [privacyModal, setPrivacyModal] = useState(false);
  const [loginStep, setLoginStep] = useState<"email" | "code">("email");
  const [loginBusy, setLoginBusy] = useState(false);
  const [garminAccountBusy, setGarminAccountBusy] = useState(false);
  const [feedback, setFeedbackText] = useState("");
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"info" | "error" | "success">("info");
  const [setupOpen, setSetupOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const emailSchema = useMemo(() => z.object({
    email: z.string().email(t.account.errors.invalidEmail),
  }), [t.account.errors.invalidEmail]);
  const codeSchema = useMemo(() => z.object({
    code: z.string().regex(/^\d{6}$/, t.account.errors.invalidCode),
  }), [t.account.errors.invalidCode]);
  const emailForm = useForm<{ email: string }>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
    mode: "onSubmit",
  });
  const codeForm = useForm<{ code: string }>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: "" },
    mode: "onSubmit",
  });
  const loginError = loginStep === "email"
    ? emailForm.formState.errors.root?.server?.message ?? emailForm.formState.errors.email?.message
    : codeForm.formState.errors.root?.server?.message ?? codeForm.formState.errors.code?.message;

  const ready = auth.ready && planner.loaded;
  const profile = planner.state?.profile;
  const currentWeek = planner.state?.currentWeek;
  const weekSentDates = currentWeek
    ? Array.from({ length: 7 }, (_, day) => addDays(currentWeek.startDate, day)).filter((date) => garmin.sentDates.has(date))
    : [];
  const weekHasSent = weekSentDates.length;
  const localizedWarning = planner.warning ? t.storage[planner.warning] : "";

  const formattedPerformance = useMemo(() => {
    if (!profile) return "";
    const hours = Math.floor(profile.raceSeconds / 3600);
    const minutes = Math.floor(profile.raceSeconds % 3600 / 60);
    const seconds = profile.raceSeconds % 60;
    return [
      hours ? `${hours} ${t.units.h}` : "",
      `${minutes} ${t.units.min}`,
      `${seconds} ${t.units.sec}`,
    ].filter(Boolean).join(" ");
  }, [profile, t.units.h, t.units.min, t.units.sec]);

  useEffect(() => () => {
    if (feedbackTimer.current !== null) clearTimeout(feedbackTimer.current);
  }, []);

  function setFeedback(message: string) {
    if (feedbackTimer.current !== null) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = null;
    setFeedbackText(message);
  }

  function showFeedback(message: string, tone: "info" | "error" | "success" = "info", autoDismiss = false) {
    setFeedback(message);
    setFeedbackTone(tone);
    if (autoDismiss) {
      feedbackTimer.current = setTimeout(() => {
        setFeedbackText("");
        feedbackTimer.current = null;
      }, 3000);
    }
  }

  async function selectLocale(value: Locale) {
    await setLocale(value);
    setLanguageMenu(false);
  }

  function saveWorkout(workout: PlannerState["currentWeek"]["workouts"][number]) {
    const state = planner.state;
    if (!state) return;
    void planner.save({
      ...state,
      currentWeek: {
        ...state.currentWeek,
        workouts: state.currentWeek.workouts.map((item) => item.day === workout.day ? workout : item),
      },
    });
  }

  function saveSetup(nextProfile: Profile) {
    const state = planner.state;
    if (!state?.currentWeek) {
      void planner.save(createPlanner(nextProfile, new Date()));
      setSetupOpen(false);
      showFeedback(t.notices.created, "success");
      return;
    }
    if (auth.token && (!garmin.loaded || garmin.error === "statusFailed")) {
      showFeedback(t.garmin.statusFailed, "error");
      return;
    }

    const regenerate = async () => {
      if (weekHasSent > 0) {
        const result = await garmin.remove(weekSentDates);
        if (result.error) {
          showFeedback(errorText(result.error, result.retryAfterSeconds, result.requestId, t), "error");
          return;
        }
      }
      const current = generateWeek(nextProfile, state.currentWeek.startDate, state.currentWeek.number);
      void planner.save({ ...state, profile: nextProfile, currentWeek: current });
      setSetupOpen(false);
      showFeedback("", "success");
    };

    const body = [
      t.confirm.regenerateBody,
      weekHasSent > 0 ? t.confirm.regenerateGarminBody(weekHasSent) : "",
    ].filter(Boolean).join("\n\n");
    Alert.alert(t.confirm.regenerateTitle, body, [
      { text: t.confirm.cancel, style: "cancel" },
      { text: t.confirm.regenerateConfirm, onPress: () => { void regenerate(); } },
    ]);
  }

  function clearPlanner() {
    Alert.alert(native.deletePlanner, native.deletePlannerConfirm, [
      { text: t.confirm.cancel, style: "cancel" },
      { text: native.deletePlanner, style: "destructive", onPress: () => {
        void planner.save(null);
        setSetupOpen(true);
        setFeedback("");
      } },
    ]);
  }

  function discardUnreadablePending() {
    Alert.alert(native.deleteLocal, native.deleteLocalConfirm, [
      { text: t.confirm.cancel, style: "cancel" },
      { text: native.deleteLocal, style: "destructive", onPress: () => {
        void planner.discardUnreadablePending()
          .then(() => showFeedback(native.deleteLocalOk, "success"))
          .catch(() => showFeedback(t.storage.unavailable, "error"));
      } },
    ]);
  }

  async function sendCode(value: string) {
    const normalized = value.normalize("NFKC").trim().toLowerCase();
    setLoginBusy(true);
    emailForm.clearErrors();
    codeForm.clearErrors();
    try {
      await mobileApi.sendCode(normalized);
      emailForm.setValue("email", normalized);
      codeForm.reset({ code: "" });
      setLoginStep("code");
    } catch (error) {
      const codeValue = error instanceof ApiError ? error.code : "";
      const key = codeValue === "invalidEmail" ? "invalidEmail" : isRateLimited(error) ? "rateLimited"
        : codeValue === "unavailable" ? "sendFailed" : "sendFailed";
      emailForm.setError("root.server", { type: "server", message: t.account.errors[key] });
    } finally {
      setLoginBusy(false);
    }
  }

  async function verifyCode(value: string) {
    setLoginBusy(true);
    codeForm.clearErrors();
    try {
      await auth.signInWithCode(emailForm.getValues("email"), value);
      setSignInModal(false);
      setLoginStep("email");
      emailForm.reset({ email: "" });
      codeForm.reset({ code: "" });
      setAccountMenu(false);
    } catch {
      const key = ["invalidCode", "codeRejected", "rateLimited"].includes(auth.error)
        ? auth.error as "invalidCode" | "codeRejected" | "rateLimited" : "failed";
      codeForm.setError("root.server", { type: "server", message: t.account.errors[key] });
    } finally {
      setLoginBusy(false);
    }
  }

  async function googleSignIn() {
    setLoginBusy(true);
    emailForm.clearErrors();
    codeForm.clearErrors();
    try {
      const success = await auth.signInWithBrowser();
      if (!success) {
        const targetForm = loginStep === "email" ? emailForm : codeForm;
        targetForm.setError("root.server", { type: "server", message: native.cancelled });
        return;
      }
      setSignInModal(false);
      setLoginStep("email");
      setAccountMenu(false);
    } catch {
      const targetForm = loginStep === "email" ? emailForm : codeForm;
      targetForm.setError("root.server", {
        type: "server",
        message: auth.error === "rateLimited" ? t.account.errors.rateLimited : t.account.errors.failed,
      });
    } finally {
      setLoginBusy(false);
    }
  }

  async function connectGarmin() {
    setGarminAccountBusy(true);
    setFeedback("");
    setAccountMenu(false);
    showFeedback(native.consent);
    try {
      const success = await auth.connectGarminInBrowser();
      if (!success) {
        showFeedback(native.cancelled, "info");
        return;
      }
      await garmin.refresh();
      showFeedback(t.garmin.connected, "success");
    } catch {
      const key = auth.error;
      const message = ["alreadyLinked", "reconnect", "permission", "failed"].includes(key)
        ? t.garmin[key as "alreadyLinked" | "reconnect" | "permission" | "failed"]
        : t.garmin.connectFailed;
      showFeedback(message, "error", true);
    } finally {
      setGarminAccountBusy(false);
    }
  }

  function confirmDisconnectGarmin() {
    Alert.alert(t.garmin.disconnectTitle, t.garmin.disconnectBody, [
      { text: t.confirm.cancel, style: "cancel" },
      { text: t.garmin.disconnectConfirm, style: "destructive", onPress: () => { void disconnectGarmin(); } },
    ]);
  }

  async function disconnectGarmin() {
    if (!auth.token) return;
    setGarminAccountBusy(true);
    try {
      const result = await mobileApi.disconnectGarmin(auth.token);
      if (result.error) {
        const key = result.error;
        const message = ["reconnect", "permission", "rateLimited", "unavailable", "network", "invalidResponse", "failed", "invalid", "alreadyLinked", "rejected"].includes(key)
          ? t.garmin[key as keyof typeof t.garmin] as string : t.garmin.disconnectFailed;
        showFeedback(`${message}${result.requestId ? ` ${t.garmin.reference}: ${result.requestId}` : ""}`, "error");
        return;
      }
      await garmin.refresh();
      showFeedback([
        `Garmin: ${t.garmin.removed(result.deleted)}`,
        result.remaining > 0 ? t.garmin.leftInGarmin(result.remaining) : "",
      ].filter(Boolean).join(" "), result.remaining > 0 ? "info" : "success");
      setAccountMenu(false);
    } catch (error) {
      showFeedback(error instanceof ApiError && error.code
        ? errorText(error.code, undefined, undefined, t) : t.garmin.disconnectFailed, "error");
    } finally {
      setGarminAccountBusy(false);
    }
  }

  async function exportData() {
    setExportBusy(true);
    showFeedback("");
    try {
      const rawPlanner = await AsyncStorage.getItem(STORAGE_KEY);
      let localPlanner: unknown = rawPlanner;
      try {
        localPlanner = rawPlanner === null ? null : JSON.parse(rawPlanner);
      } catch {
        // Keep unreadable local data in its original form in the export.
      }
      const localLanguage = await AsyncStorage.getItem(LOCALE_KEY);
      const localPending = await AsyncStorage.getItem(PENDING_ACCOUNT_KEY);
      const account = auth.token ? await mobileApi.account(auth.token) : null;
      const payload = {
        exportedAt: new Date().toISOString(),
        device: { planner: localPlanner, pendingAccountPlanner: localPending, language: localLanguage },
        account: account === null ? null : stripCredentials(account),
        notice: native.neverIncludeTokens,
      };
      const directory = FileSystem.cacheDirectory;
      if (!directory) throw new Error("Export storage is unavailable.");
      const uri = `${directory}run-week-data.json`;
      await FileSystem.writeAsStringAsync(uri, JSON.stringify(payload, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
      if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is unavailable.");
      await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: native.exportData });
      showFeedback(native.exportOk, "success");
    } catch {
      showFeedback(native.exportFailed, "error");
    } finally {
      setExportBusy(false);
    }
  }

  function confirmDeleteLocal() {
    Alert.alert(native.deleteLocal, native.deleteLocalConfirm, [
      { text: t.confirm.cancel, style: "cancel" },
      { text: native.deleteLocal, style: "destructive", onPress: () => { void deleteLocal(); } },
    ]);
  }

  async function deleteLocal() {
    try {
      await AsyncStorage.multiRemove([STORAGE_KEY, PENDING_ACCOUNT_KEY, LOCALE_KEY]);
      await planner.clearLocal();
      resetLocale();
      showFeedback(native.deleteLocalOk, "success");
    } catch {
      showFeedback(t.storage.unavailable, "error");
    }
  }

  function confirmDeleteAccount() {
    Alert.alert(native.deleteAccount, native.deleteAccountConfirm, [
      { text: t.confirm.cancel, style: "cancel" },
      { text: native.deleteAccount, style: "destructive", onPress: () => { void deleteAccount(); } },
    ]);
  }

  async function deleteAccount() {
    if (!auth.token) return;
    try {
      await mobileApi.account(auth.token, "DELETE");
      await auth.forgetSession();
      setPrivacyModal(false);
      setAccountMenu(false);
      showFeedback(native.deleteAccountOk, "success");
    } catch {
      showFeedback(t.account.errors.failed, "error");
    }
  }

  function confirmSignOut() {
    Alert.alert(t.account.signOut, t.account.signedInAs(auth.user?.email ?? ""), [
      { text: t.confirm.cancel, style: "cancel" },
      { text: t.account.signOut, style: "destructive", onPress: () => {
        void auth.signOut().then(() => {
          setAccountMenu(false);
          setFeedback("");
        }).catch(() => showFeedback(t.account.errors.failed, "error"));
      } },
    ]);
  }

  if (!ready) return <SafeAreaView style={styles.center}><StatusBar barStyle="dark-content" /><Text style={styles.loading}>{t.loading}</Text></SafeAreaView>;

  return <SafeAreaView style={styles.safeArea}>
    <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
    <Page>
      <View style={styles.top}>
        <View style={styles.topTitle}>
          <Text style={styles.brand}>RUN WEEK</Text>
          <Text style={styles.subtitle}>{t.week.heading}</Text>
        </View>
        <View style={styles.topButtons}>
          <Button label={LOCALE_NAMES[locale]} variant="secondary" onPress={() => setLanguageMenu(true)} />
          <Button label={auth.token ? "●" : "☰"} accessibilityLabel={t.account.menu} variant="secondary" onPress={() => setAccountMenu(true)} />
        </View>
      </View>

      {feedback ? <Notice tone={feedbackTone}>{feedback}</Notice> : null}
      {storageError && <Notice tone="error">{t.storage.unavailable}</Notice>}
      {auth.token && garmin.error === "statusFailed" && <Card>
        <Notice tone="error">{t.garmin.statusFailed}</Notice>
        <Button label={t.storage.retry} onPress={() => void garmin.refresh()} />
      </Card>}
      {localizedWarning ? <Card>
        <Notice tone={planner.warning === "unavailable" || planner.warning === "accountLoadFailed" || planner.warning === "unreadable" ? "error" : "info"}>
          {localizedWarning}
        </Notice>
        {planner.warning === "accountLoadFailed" && <Button label={t.storage.retry} onPress={planner.retry} />}
        {planner.warning === "unreadable" && <Button
          label={planner.pendingUnreadable ? native.deleteLocal : native.deletePlanner}
          variant="danger"
          onPress={planner.pendingUnreadable ? discardUnreadablePending : clearPlanner}
        />}
      </Card> : null}
      {planner.pendingUnreadable && planner.warning !== "unreadable" && <Card>
        <Notice tone="error">{t.storage.unreadable}</Notice>
        <Button label={native.deleteLocal} variant="danger" onPress={discardUnreadablePending} />
      </Card>}
      {["sessionExpired", "sessionCheckFailed", "secureStorageFailed"].includes(auth.error)
        && <Notice tone="info">{native[auth.error as "sessionExpired" | "sessionCheckFailed" | "secureStorageFailed"]}</Notice>}

      {planner.state && profile && <Card>
        <View style={styles.summaryHead}>
          <View style={{ flex: 1, gap: 5 }}>
            <Heading>{distanceLabel(profile.distanceMeters, t.distances)}</Heading>
            <Body>{t.summary.performanceTime}: {formattedPerformance} · VDOT {profile.vdot.toFixed(1)}</Body>
            <Body>{t.summary.schedule}: {t.runsPerWeek(selectDays(profile.schedule).length)}</Body>
            {profile.recentWeeklyVolumeKm != null && <Body>{t.summary.weeklyTarget}: {t.perWeek(`${profile.recentWeeklyVolumeKm} ${t.units.km}`)}</Body>}
            {profile.desiredWeeklyDurationMinutes != null && <Body>{t.summary.weeklyTarget}: {t.perWeek(`${Math.floor(profile.desiredWeeklyDurationMinutes / 60)} ${t.units.h} ${profile.desiredWeeklyDurationMinutes % 60} ${t.units.min}`)}</Body>}
          </View>
          <Button label={native.editSetup} expanded={setupOpen} variant="secondary" onPress={() => setSetupOpen((open) => !open)} />
        </View>
      </Card>}

      {setupOpen || !planner.state ? <SetupForm
        key={`${planner.state?.currentWeek.id ?? "new"}:${JSON.stringify(planner.state?.profile ?? null)}:${locale}`}
        profile={planner.state?.profile}
        locale={locale}
        t={t}
        onSave={saveSetup}
      /> : null}

      {planner.state?.currentWeek && <WeekView
        key={planner.state.currentWeek.id}
        week={planner.state.currentWeek}
        locale={locale}
        t={t}
        garmin={{
          configured: garmin.status.configured,
          connected: garmin.status.connected,
          sentDates: garmin.sentDates,
          busy: garmin.busy,
          send: (workouts) => currentWeek
            ? garmin.send(currentWeek, workouts, locale)
            : Promise.resolve({ count: 0, error: "invalid" }),
          remove: garmin.remove,
        }}
        onChange={saveWorkout}
      />}

      {planner.state && <ButtonRow>
        <Button label={native.deletePlanner} variant="danger" onPress={clearPlanner} />
      </ButtonRow>}
      {planner.state && <Card>
        <Button label={t.method.title} variant="secondary" expanded={methodOpen}
          onPress={() => setMethodOpen((open) => !open)} />
        {methodOpen && t.method.paragraphs.map((paragraph) => <Body key={paragraph}>{paragraph}</Body>)}
      </Card>}
    </Page>

    <ModalSheet visible={accountMenu} title={t.account.menu} closeLabel={t.garmin.helpClose} onClose={() => setAccountMenu(false)}>
      {auth.token
        ? <>
          <Body>{auth.user ? t.account.signedInAs(auth.user.email) : native.sessionCheckFailed}</Body>
          {garmin.status.connected
            ? <Button label={garminAccountBusy ? t.garmin.disconnecting : t.garmin.disconnect} variant="danger" onPress={confirmDisconnectGarmin} disabled={garminAccountBusy} />
            : <Button label={garminAccountBusy ? native.consent : t.garmin.connect} onPress={() => void connectGarmin()} disabled={!garmin.status.configured || garminAccountBusy} />}
          {!garmin.status.configured && <Notice>{t.garmin.unavailable}</Notice>}
          <Button label={native.privacy} variant="secondary" onPress={() => { setAccountMenu(false); setPrivacyModal(true); }} />
          <Button label={t.account.signOut} variant="secondary" onPress={confirmSignOut} />
        </>
        : <>
          <Body>{t.account.intro}</Body>
          <Button label={t.account.signIn} onPress={() => { setAccountMenu(false); setSignInModal(true); emailForm.clearErrors(); codeForm.clearErrors(); }} />
          <Button label={native.privacy} variant="secondary" onPress={() => { setAccountMenu(false); setPrivacyModal(true); }} />
        </>}
    </ModalSheet>

    <ModalSheet visible={languageMenu} title={t.language} closeLabel={t.garmin.helpClose} onClose={() => setLanguageMenu(false)}>
      <ChoiceGroup label={t.language} value={locale} onChange={(value) => { void selectLocale(value); }} options={LOCALES.map((code) => ({
        value: code, label: LOCALE_NAMES[code],
      }))} />
    </ModalSheet>

    <ModalSheet visible={signInModal} title={t.account.title} closeLabel={t.garmin.helpClose} onClose={() => { setSignInModal(false); emailForm.clearErrors(); codeForm.clearErrors(); }}>
      <Body>{t.account.intro}</Body>
      {loginError ? <Notice tone="error">{loginError}</Notice> : null}
      {loginStep === "email" ? <>
        <TextField label={t.account.email} value={emailForm.watch("email")} onChangeText={(value) => emailForm.setValue("email", value, { shouldDirty: true })} keyboardType="email-address" />
        <Button label={loginBusy ? t.account.sendingCode : t.account.sendCode}
          onPress={() => void emailForm.handleSubmit(({ email: value }) => sendCode(value))()} disabled={loginBusy} />
      </> : <>
        <Body>{t.account.codeSent(emailForm.getValues("email"))}</Body>
        <TextField label={t.account.code} value={codeForm.watch("code")} onChangeText={(value) => codeForm.setValue("code", value.replace(/\D/g, ""), { shouldDirty: true })} keyboardType="numeric" maxLength={6} />
        <Button label={loginBusy ? t.account.verifying : t.account.verify}
          onPress={() => void codeForm.handleSubmit(({ code: value }) => verifyCode(value))()} disabled={loginBusy} />
        <ButtonRow>
          <Button label={t.account.resend} variant="secondary"
            onPress={() => void emailForm.handleSubmit(({ email: value }) => sendCode(value))()} disabled={loginBusy} />
          <Button label={t.account.otherEmail} variant="link" onPress={() => {
            setLoginStep("email"); codeForm.reset({ code: "" }); codeForm.clearErrors(); emailForm.clearErrors();
          }} disabled={loginBusy} />
        </ButtonRow>
      </>}
      <Body style={{ textAlign: "center" }}>{t.account.or}</Body>
      <Button label={t.account.google} variant="secondary" onPress={() => void googleSignIn()} disabled={loginBusy} />
    </ModalSheet>

    <ModalSheet visible={privacyModal} title={native.privacy} closeLabel={t.garmin.helpClose} onClose={() => setPrivacyModal(false)}>
      <Body>{native.neverIncludeTokens}</Body>
      {auth.token && <Body>{native.accountData}: {auth.user?.email ?? native.sessionCheckFailed}</Body>}
      <Button label={exportBusy ? t.account.sendingCode : native.exportData} onPress={() => void exportData()} disabled={exportBusy} />
      <Button label={native.deleteLocal} variant="secondary" onPress={confirmDeleteLocal} />
      {auth.token && <Button label={native.deleteAccount} variant="danger" onPress={confirmDeleteAccount} />}
      {feedback ? <Notice tone={feedbackTone}>{feedback}</Notice> : null}
    </ModalSheet>
  </SafeAreaView>;
}

function errorText(error: string | undefined, retryAfterSeconds: number | undefined, requestId: string | undefined, t: typeof MESSAGES.en) {
  const keys = ["reconnect", "permission", "rateLimited", "rejected", "unavailable", "network", "invalidResponse", "failed", "invalid", "alreadyLinked"] as const;
  const message = error && keys.some((key) => key === error) ? t.garmin[error as (typeof keys)[number]] : t.garmin.failed;
  return [message, error === "rateLimited" && retryAfterSeconds ? t.garmin.retryAfter(retryAfterSeconds) : "", requestId ? `${t.garmin.reference}: ${requestId}` : ""]
    .filter(Boolean).join(" ");
}

export default function App() {
  return <SafeAreaProvider><LocaleProvider>
    <AuthProvider>
      <NativeApp />
    </AuthProvider>
  </LocaleProvider></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  loading: { color: colors.muted, fontSize: 16 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingVertical: 6 },
  topTitle: { flex: 1, minWidth: 0 },
  topButtons: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  brand: { color: colors.green, fontWeight: "900", fontSize: 12, letterSpacing: 2 },
  subtitle: { color: colors.ink, fontSize: 20, fontWeight: "700" },
  summaryHead: { flexDirection: "row", alignItems: "center", gap: 8 },
});
