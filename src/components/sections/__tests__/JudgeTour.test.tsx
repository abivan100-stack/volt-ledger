// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { JudgeTour, JudgeTourLaunchButton } from '../JudgeTour'
import { useTourStore } from '../../../store/useTourStore'

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

  it('renders tour modal when active', () => {
    useTourStore.getState().startTour()
    render(
      <BrowserRouter>
        <JudgeTour />
      </BrowserRouter>,
    )

    const dialog = screen.getByRole('dialog', { name: '60-Second Judge Tour' })
    expect(dialog).toBeTruthy()
    expect(screen.getByText(/Decentralized P2P Energy Simulation/i)).toBeTruthy()
  })

  it('advances to next step on Next button click', () => {
    useTourStore.getState().startTour()
    render(
      <BrowserRouter>
        <JudgeTour />
      </BrowserRouter>,
    )

    const nextBtn = screen.getByRole('button', { name: /next step/i })
    fireEvent.click(nextBtn)

    expect(screen.getByText(/Cryptographic SHA-256 Hash Chain/i)).toBeTruthy()
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
