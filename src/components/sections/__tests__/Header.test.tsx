// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Header from '../Header'
import { useEnergyStore } from '../../../store/useEnergyStore'

const { isApiConfiguredMock } = vi.hoisted(() => ({ isApiConfiguredMock: vi.fn() }))

vi.mock('../../../api/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/config')>()),
  isApiConfigured: isApiConfiguredMock,
}))

const pristine = useEnergyStore.getState()

beforeEach(() => {
  useEnergyStore.setState(pristine, true)
  useEnergyStore.getState().start()
  useEnergyStore.getState().stop()
  isApiConfiguredMock.mockReset()
  isApiConfiguredMock.mockReturnValue(false)
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

  it('renders the logo as a link back home on the account page too', () => {
    // A "back to top" button here would only scroll the account page — the
    // logo has to actually navigate on every page that is not the home page,
    // not only the ledger.
    renderHeader('/account')

    const logo = screen.getByRole('link', { name: 'Volt — back to home' })
    expect(logo.getAttribute('href')).toBe('/')
  })

  it('links "how it works" to the home page section from off the home page', () => {
    // There is no #how element to scroll to on the account page, so an
    // in-place scroll would silently do nothing; this has to navigate.
    renderHeader('/account')

    const howItWorks = screen.getByRole('link', { name: /how it works/i })
    expect(howItWorks.getAttribute('href')).toBe('/#how')
  })

  it('scrolls "how it works" in place without navigating away from the home page', () => {
    renderHeader('/')

    const howItWorks = screen.getByText(/how it works/i)
    expect(howItWorks.tagName).toBe('A')
    expect(howItWorks.getAttribute('href')).toBe('#how')
  })
})

describe('Header account link', () => {
  it('is absent in the browser-only demo, leaving the existing chrome untouched', () => {
    isApiConfiguredMock.mockReturnValue(false)
    renderHeader('/')
    expect(screen.queryByRole('link', { name: /account/i })).toBeNull()
  })

  it('appears once an API is configured', () => {
    isApiConfiguredMock.mockReturnValue(true)
    renderHeader('/')

    const link = screen.getByRole('link', { name: /account/i })
    expect(link.getAttribute('href')).toBe('/account')
  })

  it('is also reachable from the ledger pages', () => {
    isApiConfiguredMock.mockReturnValue(true)
    renderHeader('/ledger')
    expect(screen.getByRole('link', { name: /account/i }).getAttribute('href')).toBe('/account')
  })
})
