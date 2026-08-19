// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ThemeToggle from '../ThemeToggle'

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

afterEach(cleanup)

describe('ThemeToggle', () => {
  it('switches between light and dark themes and persists the choice', () => {
    render(<ThemeToggle />)
    const toggle = screen.getByRole('button')

    fireEvent.click(toggle)
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem('volt-theme')).toBe('dark')
    expect(toggle.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(toggle)
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(window.localStorage.getItem('volt-theme')).toBe('light')
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
  })
})
