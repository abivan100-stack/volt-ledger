// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import VerificationCodeField from '../VerificationCodeField'

/**
 * A code arrives in a notification and is retyped, or pasted, under mild
 * annoyance. The field's job is to accept every reasonable version of that:
 * digits with spaces, digits with a stray letter, more digits than asked for.
 */

afterEach(() => {
  cleanup()
})

function renderField(overrides: Partial<React.ComponentProps<typeof VerificationCodeField>> = {}) {
  const onChange = vi.fn()
  render(
    <VerificationCodeField
      id="code"
      label="VERIFICATION CODE"
      length={6}
      value=""
      onChange={onChange}
      {...overrides}
    />,
  )
  return { onChange }
}

function input(): HTMLInputElement {
  return screen.getByLabelText('VERIFICATION CODE') as HTMLInputElement
}

describe('VerificationCodeField', () => {
  it('offers the code from the arriving message', () => {
    renderField()

    // This attribute is what makes the iOS/Android autofill suggestion appear.
    expect(input().getAttribute('autocomplete')).toBe('one-time-code')
    expect(input().getAttribute('inputmode')).toBe('numeric')
  })

  it('is one field, so a screen reader announces one labelled control', () => {
    renderField()

    expect(screen.getAllByLabelText('VERIFICATION CODE')).toHaveLength(1)
  })

  it('keeps only the digits from what was typed', () => {
    const { onChange } = renderField()

    fireEvent.change(input(), { target: { value: '12a3 45' } })

    expect(onChange).toHaveBeenCalledWith('12345')
  })

  it('accepts a pasted code that carries spaces', () => {
    const { onChange } = renderField()

    fireEvent.change(input(), { target: { value: '123 456' } })

    expect(onChange).toHaveBeenCalledWith('123456')
  })

  it('never reports more digits than the code has', () => {
    const { onChange } = renderField()

    fireEvent.change(input(), { target: { value: '1234567890' } })

    expect(onChange).toHaveBeenCalledWith('123456')
  })

  it('stops accepting input while a check is in flight', () => {
    renderField({ disabled: true })

    expect(input().hasAttribute('disabled')).toBe(true)
  })

  it('describes itself with a hint when given one', () => {
    renderField({ hint: 'Sent to asha@example.com.' })

    const described = input().getAttribute('aria-describedby')
    expect(described).toBe('code-hint')
    expect(screen.getByText('Sent to asha@example.com.').id).toBe('code-hint')
  })
})
