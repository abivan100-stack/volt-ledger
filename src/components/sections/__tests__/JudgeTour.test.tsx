// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import JudgeTour from '../JudgeTour'
import { useEnergyStore } from '../../../store/useEnergyStore'

const pristineState = useEnergyStore.getState()

beforeEach(() => {
  useEnergyStore.setState(pristineState, true)
})

afterEach(() => {
  cleanup()
})

describe('JudgeTour component', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(<JudgeTour isOpen={false} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders Step 1 and sets solar noon conditions when opened', () => {
    render(<JudgeTour isOpen={true} onClose={vi.fn()} />)

    expect(screen.getByText(/Solar Peak in Nolambur/i).textContent).toBeTruthy()
    expect(screen.getByText(/STEP 1 · SOLAR PEAK/i).textContent).toBeTruthy()
    expect(useEnergyStore.getState().dayType).toBe('sunny-weekday')
    expect(useEnergyStore.getState().simMinute).toBe(750)
  })

  it('advances through steps on NEXT click and triggers tamper test at step 4', () => {
    render(<JudgeTour isOpen={true} onClose={vi.fn()} />)

    // Move to Step 2
    fireEvent.click(screen.getByRole('button', { name: /NEXT/i }))
    expect(screen.getByText(/Direct Peer-to-Peer Trading/i).textContent).toBeTruthy()

    // Move to Step 3
    fireEvent.click(screen.getByRole('button', { name: /NEXT/i }))
    expect(screen.getByText(/Cryptographic SHA-256 Ledger/i).textContent).toBeTruthy()

    // Move to Step 4 (Tamper Demo)
    fireEvent.click(screen.getByRole('button', { name: /NEXT/i }))
    expect(screen.getByText(/Real-Time Tamper Detection/i).textContent).toBeTruthy()
    // Chain should have an invalid block
    expect(useEnergyStore.getState().chain.some((b) => b.invalid)).toBe(true)

    // Move to Step 5 (Restore & Fairness)
    fireEvent.click(screen.getByRole('button', { name: /NEXT/i }))
    expect(screen.getByText(/Self-Healing & 92% Street Autonomy/i).textContent).toBeTruthy()
    // Chain should be restored
    expect(useEnergyStore.getState().chain.some((b) => b.invalid)).toBe(false)
  })

  it('calls onClose when close button or FINISH is clicked', () => {
    const handleClose = vi.fn()
    render(<JudgeTour isOpen={true} onClose={handleClose} />)

    fireEvent.click(screen.getByLabelText(/Exit tour/i))
    expect(handleClose).toHaveBeenCalled()
  })

  it('closes on Escape key press', () => {
    const handleClose = vi.fn()
    render(<JudgeTour isOpen={true} onClose={handleClose} />)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(handleClose).toHaveBeenCalled()
  })
})
