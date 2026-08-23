// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import JudgeTour from '../JudgeTour'
import { useEnergyStore } from '../../../store/useEnergyStore'
import { useTourStore } from '../../../store/useTourStore'

const pristineEnergyState = useEnergyStore.getState()

beforeEach(() => {
  useEnergyStore.setState(pristineEnergyState, true)
  useTourStore.setState({ isOpen: false })
})

afterEach(() => {
  cleanup()
})

describe('JudgeTour component', () => {
  it('renders nothing when isOpen is false', () => {
    useTourStore.setState({ isOpen: false })
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <JudgeTour />
      </MemoryRouter>,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders Step 1 and sets solar noon conditions when opened', () => {
    useTourStore.setState({ isOpen: true })
    render(
      <MemoryRouter initialEntries={['/']}>
        <JudgeTour />
      </MemoryRouter>,
    )

    expect(screen.getByText(/The Local Solar Opportunity/i).textContent).toBeTruthy()
    expect(screen.getByText(/01 · VISION & GAP/i).textContent).toBeTruthy()
    expect(useEnergyStore.getState().dayType).toBe('sunny-weekday')
    expect(useEnergyStore.getState().simMinute).toBe(750)
  })

  it('advances through steps on NEXT click and triggers tamper test at step 4', () => {
    useTourStore.setState({ isOpen: true })
    render(
      <MemoryRouter initialEntries={['/']}>
        <JudgeTour />
      </MemoryRouter>,
    )

    // Move to Step 2
    fireEvent.click(screen.getByRole('button', { name: /NEXT/i }))
    expect(screen.getByText(/Real-Time Street Telemetry/i).textContent).toBeTruthy()

    // Move to Step 3
    fireEvent.click(screen.getByRole('button', { name: /NEXT/i }))
    expect(screen.getByText(/Interactive Neighbourhood Map/i).textContent).toBeTruthy()

    // Move to Step 4 (Tamper Demo)
    fireEvent.click(screen.getByRole('button', { name: /NEXT/i }))
    expect(screen.getByText(/Tamper-Evident SHA-256 Chain/i).textContent).toBeTruthy()
    // Chain should have an invalid block
    expect(useEnergyStore.getState().chain.some((b) => b.invalid)).toBe(true)

    // Move to Step 5 (Restore & Proof)
    fireEvent.click(screen.getByRole('button', { name: /NEXT/i }))
    expect(screen.getByText(/Open Cryptographic Auditability/i).textContent).toBeTruthy()
    // Chain should be restored
    expect(useEnergyStore.getState().chain.some((b) => b.invalid)).toBe(false)
  })

  it('closes tour when close button is clicked', () => {
    useTourStore.setState({ isOpen: true })
    render(
      <MemoryRouter initialEntries={['/']}>
        <JudgeTour />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByLabelText(/Exit Judge Tour/i))
    expect(useTourStore.getState().isOpen).toBe(false)
  })

  it('closes on Escape key press', () => {
    useTourStore.setState({ isOpen: true })
    render(
      <MemoryRouter initialEntries={['/']}>
        <JudgeTour />
      </MemoryRouter>,
    )

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useTourStore.getState().isOpen).toBe(false)
  })
})
