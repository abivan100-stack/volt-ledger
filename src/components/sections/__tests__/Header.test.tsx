// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Header from '../Header'
import { useEnergyStore } from '../../../store/useEnergyStore'

const pristine = useEnergyStore.getState()

beforeEach(() => {
  useEnergyStore.setState(pristine, true)
  useEnergyStore.getState().start()
  useEnergyStore.getState().stop()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderHeader(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Header />
    </MemoryRouter>,
  )
}

describe('Header', () => {
  it('renders the logo as a button on the homepage and smooth-scrolls to the top on click', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    renderHeader('/')

    const logo = screen.getByRole('button', { name: 'Volt — back to top' })
    expect(logo.textContent).toContain('VOLT')
    logo.click()

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })

  it('renders the logo as a link back home on the ledger page', () => {
    renderHeader('/ledger')

    const logo = screen.getByRole('link', { name: 'Volt — back to home' })
    expect(logo.getAttribute('href')).toBe('/')
    expect(logo.textContent).toContain('VOLT')
  })
})
