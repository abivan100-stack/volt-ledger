// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { JudgeTour, JudgeTourLaunchButton } from '../JudgeTour'
import { useTourStore, TOUR_STEPS } from '../../../store/useTourStore'
import { useEnergyStore } from '../../../store/useEnergyStore'
import { appendBlock } from '../../../lib/hashChain'

describe('JudgeTour', () => {
  beforeEach(() => {
    useTourStore.getState().stopTour()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders nothing when tour is inactive', () => {
    render(
      <BrowserRouter>
        <JudgeTour />
      </BrowserRouter>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders tour modal when active with step 1', () => {
    useTourStore.getState().startTour()
    render(
      <BrowserRouter>
        <JudgeTour />
      </BrowserRouter>,
    )

    const dialog = screen.getByRole('dialog', { name: '60-Second Judge Tour' })
    expect(dialog).toBeTruthy()
    expect(screen.getByText(/Decentralized P2P Energy Simulation/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /previous step/i }).getAttribute('disabled')).not.toBeNull()
  })

  it('advances to next step on Next button click and enables Prev button', () => {
    useTourStore.getState().startTour()
    render(
      <BrowserRouter>
        <JudgeTour />
      </BrowserRouter>,
    )

    const nextBtn = screen.getByRole('button', { name: /next step/i })
    fireEvent.click(nextBtn)

    expect(screen.getByText(/Cryptographic SHA-256 Hash Chain/i)).toBeTruthy()
    const prevBtn = screen.getByRole('button', { name: /previous step/i })
    expect(prevBtn.getAttribute('disabled')).toBeNull()

    fireEvent.click(prevBtn)
    expect(screen.getByText(/Decentralized P2P Energy Simulation/i)).toBeTruthy()
  })

  it('allows jumping to step via step dots', () => {
    useTourStore.getState().startTour()
    render(
      <BrowserRouter>
        <JudgeTour />
      </BrowserRouter>,
    )

    const dot3 = screen.getByRole('button', { name: /jump to step 3/i })
    fireEvent.click(dot3)

    expect(screen.getByText(/Real-Time Tamper Invalidation & Resilience/i)).toBeTruthy()
  })

  it('displays and triggers tamper attack action button on tamper step', () => {
    useEnergyStore.setState({
      chain: [
        appendBlock([], 1, { t: '12:00', from: 'Nikil', to: 'Prem', kwh: 1.0, credit: 5.0 }),
      ],
      compromised: false,
    })

    useTourStore.getState().startTour()
    useTourStore.getState().goToStep(2) // Step 3: Tamper step (0-indexed 2)

    render(
      <BrowserRouter>
        <JudgeTour />
      </BrowserRouter>,
    )

    const tamperBtn = screen.getByRole('button', { name: /trigger tamper attack demo/i })
    expect(tamperBtn).toBeTruthy()

    fireEvent.click(tamperBtn)
    expect(useEnergyStore.getState().compromised).toBe(true)
  })

  it('toggles pause and resume with the play/pause button', () => {
    useTourStore.getState().startTour()
    render(
      <BrowserRouter>
        <JudgeTour />
      </BrowserRouter>,
    )

    const pauseBtn = screen.getByRole('button', { name: /pause tour/i })
    fireEvent.click(pauseBtn)
    expect(useTourStore.getState().isPaused).toBe(true)

    const resumeBtn = screen.getByRole('button', { name: /resume tour/i })
    fireEvent.click(resumeBtn)
    expect(useTourStore.getState().isPaused).toBe(false)
  })

  it('shows Finish button on final step and finishes tour on click', () => {
    useTourStore.getState().startTour()
    useTourStore.getState().goToStep(TOUR_STEPS.length - 1)

    render(
      <BrowserRouter>
        <JudgeTour />
      </BrowserRouter>,
    )

    const finishBtn = screen.getByRole('button', { name: /finish tour/i })
    expect(finishBtn.textContent).toBe('Finish')

    fireEvent.click(finishBtn)
    expect(useTourStore.getState().isActive).toBe(false)
  })

  it('exits tour on close button click', () => {
    useTourStore.getState().startTour()
    render(
      <BrowserRouter>
        <JudgeTour />
      </BrowserRouter>,
    )

    const exitBtn = screen.getByRole('button', { name: /exit tour/i })
    fireEvent.click(exitBtn)

    expect(useTourStore.getState().isActive).toBe(false)
  })
})

describe('JudgeTourLaunchButton', () => {
  beforeEach(() => {
    useTourStore.getState().stopTour()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders launch button when tour is inactive', () => {
    render(<JudgeTourLaunchButton />)
    expect(screen.getByText('60s Tour')).toBeTruthy()
  })

  it('starts tour on click', () => {
    render(<JudgeTourLaunchButton />)
    fireEvent.click(screen.getByRole('button'))
    expect(useTourStore.getState().isActive).toBe(true)
  })
})
