// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyTheme, effectiveTheme, initializeTheme, readThemePreference, setThemePreference } from '../themeMode'

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

afterEach(() => {
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('themeMode', () => {
  it('defaults to system and applies an explicit preference', () => {
    expect(readThemePreference()).toBe('system')
    setThemePreference('dark')
    expect(readThemePreference()).toBe('dark')
    expect(effectiveTheme()).toBe('dark')
    setThemePreference('light')
    expect(effectiveTheme()).toBe('light')
  })

  it('restores system mode by removing the explicit theme override', () => {
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    setThemePreference('system')
    initializeTheme()
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
})
