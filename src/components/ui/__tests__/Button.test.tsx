// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Button } from '../button'

afterEach(() => {
  cleanup()
})

describe('Button', () => {
  it('renders standard button with children', () => {
    render(<Button>Click me</Button>)
    const button = screen.getByRole('button')
    expect(button).toBeTruthy()
    expect(button.textContent).toBe('Click me')
  })

  it('applies variant classes properly', () => {
    render(<Button variant="volt">Volt Action</Button>)
    const button = screen.getByRole('button')
    expect(button.getAttribute('class')).toContain('volt-btn-volt')
  })

  it('renders disabled state', () => {
    render(<Button disabled>Disabled Action</Button>)
    const button = screen.getByRole('button')
    expect(button.getAttribute('disabled')).not.toBeNull()
  })
})
