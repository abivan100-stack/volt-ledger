export type ThemeMode = 'system' | 'light' | 'dark'

const THEME_STORAGE_KEY = 'volt-theme'

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function readThemePreference(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeMode(stored) ? stored : 'system'
  } catch {
    return 'system'
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
