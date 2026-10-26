import { createSignal } from 'solid-js';

const preferences = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof preferences)[number];
const storageKey = 'genanki-web:theme';

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(storageKey);
    return preferences.find((preference) => preference === saved) ?? 'system';
  } catch {
    return 'system';
  }
}

const [preference, setPreference] = createSignal(readPreference());
const systemTheme = matchMedia('(prefers-color-scheme: dark)');

function applyTheme() {
  const useDark = preference() === 'dark' || (preference() === 'system' && systemTheme.matches);
  document.documentElement.dataset.theme = useDark ? 'flexoki-dark' : 'flexoki-light';
}

/** Current appearance preference; user content is never included in appearance storage. */
export const themePreference = preference;

/** Applies and remembers an explicit appearance choice, tolerating disabled browser storage. */
export function setThemePreference(value: ThemePreference): void {
  setPreference(value);
  applyTheme();

  try {
    if (value === 'system') localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, value);
  } catch {
    // the selected theme still works for this session if browser storage is unavailable
  }
}

/** Applies the saved/system theme and follows system appearance changes until disposed. */
export function initializeTheme(): () => void {
  applyTheme();
  systemTheme.addEventListener('change', applyTheme);
  return () => systemTheme.removeEventListener('change', applyTheme);
}
