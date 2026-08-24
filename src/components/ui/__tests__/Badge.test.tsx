// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Badge } from '../badge'

afterEach(() => {
  cleanup()
})

describe('Badge', () => {
  it('renders badge with label', () => {
    render(<Badge>Verified</Badge>)
    const badge = screen.getByText('Verified')
    expect(badge).toBeTruthy()
    expect(badge.getAttribute('class')).toContain('volt-badge')
  })

  it('applies volt variant class', () => {
    render(<Badge variant="volt">Active P2P</Badge>)
    const badge = screen.getByText('Active P2P')
    expect(badge.getAttribute('class')).toContain('volt-badge-volt')
  })
})
