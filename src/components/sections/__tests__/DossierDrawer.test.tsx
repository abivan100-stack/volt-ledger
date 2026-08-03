// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import DossierDrawer from '../DossierDrawer'
import { useEnergyStore } from '../../../store/useEnergyStore'

const pristine = useEnergyStore.getState()

beforeEach(() => {
  useEnergyStore.setState(pristine, true)
  useEnergyStore.getState().start()
  useEnergyStore.getState().stop()
})

afterEach(() => {
  cleanup()
})

function renderDrawer() {
  return render(<DossierDrawer />)
}

describe('DossierDrawer', () => {
  it('renders nothing when no household is selected', () => {
    renderDrawer()
    expect(document.querySelector('.dossier-sheet')).toBeNull()
  })

  it('opens with the selected household dossier and moves focus into the sheet', () => {
    const { rerender } = renderDrawer()
    act(() => useEnergyStore.getState().selectHouse(0))
    rerender(<DossierDrawer />)

    const sheet = document.querySelector<HTMLElement>('.dossier-sheet')
    expect(sheet).not.toBeNull()
    const household = useEnergyStore.getState().households[0]
    expect(sheet?.textContent).toContain(household.name)
    expect(sheet?.textContent).toContain(household.meter)
    expect(sheet?.textContent).toContain('Rooftop specification')
    expect(sheet?.querySelector('.dossier-close-button')).not.toBeNull()
    expect(sheet?.contains(document.activeElement)).toBe(true)
  })

  it('exposes dialog semantics and locks body scroll while open', () => {
    const { rerender } = renderDrawer()
    act(() => useEnergyStore.getState().selectHouse(0))
    rerender(<DossierDrawer />)

    const sheet = document.querySelector<HTMLElement>('.dossier-sheet')
    expect(sheet?.getAttribute('role')).toBe('dialog')
    expect(sheet?.getAttribute('aria-modal')).toBe('true')
    expect(sheet?.getAttribute('aria-labelledby')).toBe('dossier-title')
    const title = document.querySelector('#dossier-title')
    expect(title?.textContent).toBe(useEnergyStore.getState().households[0].name)
    expect(document.body.style.overflow).toBe('hidden')

    act(() => useEnergyStore.getState().closeDossier())
    rerender(<DossierDrawer />)
    expect(document.body.style.overflow).toBe('')
  })

  it('closes via the close button and restores the trigger focus', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()

    const { rerender } = renderDrawer()
    act(() => useEnergyStore.getState().selectHouse(1))
    rerender(<DossierDrawer />)
    expect(document.querySelector('.dossier-sheet')).not.toBeNull()

    const closeButtons = screen.getAllByLabelText('Close dossier')
    act(() => closeButtons[closeButtons.length - 1].click())

    expect(useEnergyStore.getState().selectedHouseIndex).toBeNull()
    rerender(<DossierDrawer />)
    expect(document.querySelector('.dossier-sheet')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('closes when Escape is pressed', () => {
    const { rerender } = renderDrawer()
    act(() => useEnergyStore.getState().selectHouse(2))
    rerender(<DossierDrawer />)
    expect(document.querySelector('.dossier-sheet')).not.toBeNull()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(useEnergyStore.getState().selectedHouseIndex).toBeNull()
    rerender(<DossierDrawer />)
    expect(document.querySelector('.dossier-sheet')).toBeNull()
  })

  it('shows the empty activity state when the ledger has no trades', () => {
    const { rerender } = renderDrawer()
    act(() => {
      useEnergyStore.setState({ chain: [] })
      useEnergyStore.getState().selectHouse(3)
    })
    rerender(<DossierDrawer />)
    expect(document.querySelector('.dossier-sheet')?.textContent).toContain('No trades yet today.')
  })
})
