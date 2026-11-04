import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { detectLocale, isLocale, type Locale } from "@/features/i18n/locales";

const LOCALE_KEY = "run-week-locale";

type LocaleContextValue = {
  locale: Locale;
  storageError: boolean;
  setLocale(locale: Locale): Promise<void>;
  resetLocale(): void;
};
const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: PropsWithChildren) {
  const [locale, setCurrentLocale] = useState<Locale>("en");
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(LOCALE_KEY).then((saved) => {
      if (active) setCurrentLocale(isLocale(saved) ? saved : detectLocale([Intl.DateTimeFormat().resolvedOptions().locale]));
    }).catch(() => {
      if (active) {
        setCurrentLocale(detectLocale([Intl.DateTimeFormat().resolvedOptions().locale]));
        setStorageError(true);
      }
    });
    return () => { active = false; };
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    setCurrentLocale(next);
    try {
      await AsyncStorage.setItem(LOCALE_KEY, next);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, []);

  const resetLocale = useCallback(() => {
    setCurrentLocale("en");
    setStorageError(false);
  }, []);

  const value = useMemo(() => ({ locale, storageError, setLocale, resetLocale }),
    [locale, storageError, setLocale, resetLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("LocaleProvider is missing.");
  return value;
}
