// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LedgerPageFrame from '../LedgerPageFrame'

/**
 * Shared by every /ledger* route (overview, neighbourhood, settlement,
 * chain), so it is the one place their common title needs to be set — and the
 * one place that must not lose a race with any other effect trying to set a
 * different title for the same commit.
 */

vi.mock('../../components/sections/Header', () => ({ default: () => null }))
vi.mock('../../components/sections/Footer', () => ({ default: () => null }))
vi.mock('../../components/sections/DossierDrawer', () => ({ default: () => null }))
vi.mock('../../hooks/useScrollReveal', () => ({ useScrollReveal: () => undefined }))

afterEach(cleanup)

describe('LedgerPageFrame title', () => {
  it('sets the shared ledger title on mount', () => {
    render(
      <MemoryRouter initialEntries={['/ledger']}>
        <LedgerPageFrame kicker="01" title="Overview" body="Body text">
          <div>content</div>
        </LedgerPageFrame>
      </MemoryRouter>,
    )

    expect(document.title).toBe('Volt Ledger — Live Energy Exchange')
  })
})
