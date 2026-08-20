// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import PasswordField from '../PasswordField'

/**
 * Revealing a password is a deliberate, reversible action taken by the person
 * typing it. The control has to be a real button — not a click handler on an
 * icon — so it is reachable by keyboard, and its accessible name has to track
 * what it will do next, since a toggle whose name is stale tells a screen reader
 * the opposite of the truth.
 */

afterEach(() => {
  cleanup()
})

function renderField(overrides: Partial<React.ComponentProps<typeof PasswordField>> = {}) {
  const onChange = vi.fn()
  render(
    <PasswordField
      id="password"
      label="PASSWORD"
      name="password"
      autoComplete="current-password"
      value=""
      onChange={onChange}
      {...overrides}
    />,
  )
  return { onChange }
}

function input(): HTMLInputElement {
  return screen.getByLabelText('PASSWORD') as HTMLInputElement
}

function toggle(): HTMLButtonElement {
  return screen.getByRole('button', { name: /show password|hide password/i }) as HTMLButtonElement
}

describe('PasswordField', () => {
  it('masks what is typed until asked otherwise', () => {
    renderField()

    expect(input().getAttribute('type')).toBe('password')
    expect(toggle().getAttribute('aria-label')).toBe('Show password')
  })

  it('reveals the value when the toggle is pressed', () => {
    renderField({ value: 'correct-horse' })

    fireEvent.click(toggle())

    expect(input().getAttribute('type')).toBe('text')
    expect(input().value).toBe('correct-horse')
  })

  it('masks it again on a second press', () => {
    renderField()

    fireEvent.click(toggle())
    fireEvent.click(toggle())

    expect(input().getAttribute('type')).toBe('password')
  })

  it('names the toggle after what it will do next', () => {
    renderField()

    // Stale naming is the failure mode worth pinning: a control still called
    // "Show password" while the password is visible is actively misleading.
    expect(toggle().getAttribute('aria-label')).toBe('Show password')
    fireEvent.click(toggle())
    expect(toggle().getAttribute('aria-label')).toBe('Hide password')
  })

  it('keeps the visible text inside the accessible name', () => {
    renderField()

    // WCAG label-in-name: speech input users say what they see.
    expect(toggle().textContent).toBe('SHOW')
    expect(toggle().getAttribute('aria-label')?.toLowerCase()).toContain('show')

    fireEvent.click(toggle())
    expect(toggle().textContent).toBe('HIDE')
    expect(toggle().getAttribute('aria-label')?.toLowerCase()).toContain('hide')
  })

  it('does not submit the form it sits in', () => {
    const onSubmit = vi.fn((event: React.FormEvent) => {
      event.preventDefault()
    })
    render(
      <form onSubmit={onSubmit}>
        <PasswordField
          id="nested"
          label="NESTED"
          name="password"
          autoComplete="current-password"
          value=""
          onChange={vi.fn()}
        />
      </form>,
    )

    fireEvent.click(screen.getByRole('button', { name: /show password/i }))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('reports what was typed', () => {
    const { onChange } = renderField()

    fireEvent.change(input(), { target: { value: 'a-long-password' } })

    expect(onChange).toHaveBeenCalledWith('a-long-password')
  })

  it('carries the autocomplete hint the browser needs', () => {
    renderField({ autoComplete: 'new-password' })

    expect(input().getAttribute('autocomplete')).toBe('new-password')
  })

  it('shows a hint when one is given', () => {
    renderField({ hint: 'At least 12 characters.' })

    expect(screen.getByText('At least 12 characters.')).toBeTruthy()
  })

  it('starts masked on every mount', () => {
    const first = renderField()
    fireEvent.click(toggle())
    expect(input().getAttribute('type')).toBe('text')
    cleanup()

    void first
    renderField()
    // Revealing is per-visit, never remembered.
    expect(input().getAttribute('type')).toBe('password')
  })
})
