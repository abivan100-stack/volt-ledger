// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import AppLoading from '../AppLoading'

afterEach(cleanup)

describe('AppLoading', () => {
  it('announces an accessible loading state', () => {
    const { container } = render(<AppLoading />)
    const screenElement = container.querySelector('.app-loading-screen')

    expect(screenElement?.getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('progressbar', { name: 'Loading Volt' })).toBeTruthy()
    expect(screen.getByText('CONNECTING TO THE LEDGER')).toBeTruthy()
  })
})
