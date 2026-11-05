export const THEME_STORAGE_KEY = "run-week-theme";

export type Theme = "light" | "dark";

let currentTheme: Theme | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function readTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function getThemeSnapshot(): Theme {
  currentTheme ??= readTheme();
  return currentTheme;
}

export function subscribeToTheme(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
      currentTheme = readTheme();
      document.documentElement.dataset.theme = currentTheme;
      emit();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function setTheme(theme: Theme) {
  currentTheme = theme;
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The choice still applies to this page.
  }
  emit();
}
