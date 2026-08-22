// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import VoltPage from '../VoltPage'

/**
 * The header's "how it works" link, clicked from off the home page, has to
 * navigate here rather than scroll in place — there is nothing to scroll to
 * anywhere else. React Router does not scroll to a URL hash on its own, so
 * this page has to do it once it arrives.
 *
 * Every section is stubbed: what is under test is that this page reacts to
 * its own arriving hash, not what Hero, Spread, or any other section render.
 */

const { scrollToIdMock } = vi.hoisted(() => ({ scrollToIdMock: vi.fn() }))

vi.mock('../../utils/scrollToId', () => ({ scrollToId: scrollToIdMock }))
vi.mock('../../components/sections/Header', () => ({ default: () => null }))
vi.mock('../../components/sections/Hero', () => ({ default: () => null }))
vi.mock('../../components/sections/Spread', () => ({ default: () => null }))
vi.mock('../../components/sections/HowItWorks', () => ({ default: () => null }))
vi.mock('../../components/sections/LedgerCta', () => ({ default: () => null }))
vi.mock('../../components/sections/ComparisonTable', () => ({ default: () => null }))
vi.mock('../../components/sections/Footer', () => ({ default: () => null }))

afterEach(() => {
  cleanup()
  scrollToIdMock.mockReset()
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <VoltPage />
    </MemoryRouter>,
  )
}

describe('VoltPage arriving with #how', () => {
  it('scrolls to the how-it-works section once mounted', () => {
    renderAt('/#how')

    expect(scrollToIdMock).toHaveBeenCalledWith('how')
  })

  it('does nothing when there is no hash', () => {
    renderAt('/')

    expect(scrollToIdMock).not.toHaveBeenCalled()
  })

  it('ignores a hash naming something other than how-it-works', () => {
    renderAt('/#somewhere-else')

    expect(scrollToIdMock).not.toHaveBeenCalled()
  })
})

describe('VoltPage title', () => {
  it('sets its own title rather than relying on a global default', () => {
    // App.tsx used to set this from one place keyed on pathname; on any
    // navigation where a page's own title effect landed in the same commit as
    // that one, the generic title fired after the specific one and won — a
    // page could show the wrong tab title depending on render timing. Every
    // page now owns its own title outright, so there is nothing left to race.
    renderAt('/')

    expect(document.title).toBe('Volt — Local Energy Ledger')
  })
})
