export type ThemeMode = 'system' | 'light' | 'dark'

const THEME_STORAGE_KEY = 'volt-theme'

/* Volt ships light-first: with no stored preference the ledger loads in light
   mode regardless of the operating-system setting. `index.html` applies the
   same default before first paint so there is no dark flash while loading. */
const DEFAULT_THEME_MODE: ThemeMode = 'light'

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function readThemePreference(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeMode(stored) ? stored : DEFAULT_THEME_MODE
  } catch {
    return DEFAULT_THEME_MODE
  }
}

export function systemTheme(): Exclude<ThemeMode, 'system'> {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function effectiveTheme(): Exclude<ThemeMode, 'system'> {
  const explicit = document.documentElement.dataset.theme
  if (explicit === 'light' || explicit === 'dark') return explicit
  return systemTheme()
}

export function applyTheme(mode: ThemeMode): void {
  if (mode === 'system') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.dataset.theme = mode
  }
}

export function setThemePreference(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // Private browsing can deny storage; the live theme still applies.
  }
  applyTheme(mode)
}

export function initializeTheme(): void {
  applyTheme(readThemePreference())
}
