// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Progress } from '../progress'

describe('Progress component', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders progress bar with correct value percentage', () => {
    render(<Progress value={75} aria-label="Energy autonomy progress" />)
    const progress = screen.getByRole('progressbar', { name: 'Energy autonomy progress' })
    expect(progress).toBeTruthy()
    expect(progress.getAttribute('class')).toContain('volt-progress')
  })
})
