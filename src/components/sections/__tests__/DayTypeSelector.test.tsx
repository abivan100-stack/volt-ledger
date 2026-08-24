// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import DayTypeSelector from '../DayTypeSelector'
import { useEnergyStore } from '../../../store/useEnergyStore'

const pristine = useEnergyStore.getState()
const originalClipboard = navigator.clipboard

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}</output>
}

function renderSelector(path = '/ledger?day=sunny-weekday&hour=8') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DayTypeSelector />
      <LocationProbe />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useEnergyStore.setState(pristine, true)
})

afterEach(() => {
  useEnergyStore.getState().stop()
  cleanup()
  vi.restoreAllMocks()
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: originalClipboard,
  })
})

describe('DayTypeSelector scenario controls', () => {
  it('marks an arbitrary replay hour as the current selection', () => {
    renderSelector('/ledger?day=sunny-weekday&hour=8')

    expect(screen.getByRole('button', { name: 'CURRENT 08:00' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('sets a time-of-day preset and keeps the URL replayable', () => {
    renderSelector()

    fireEvent.click(screen.getByRole('button', { name: 'EVENING 17:00' }))

    expect(useEnergyStore.getState().config.startHour).toBe(17)
    expect(useEnergyStore.getState().simMinute).toBe(17 * 60)
    expect(screen.getByRole('button', { name: 'EVENING 17:00' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('location').textContent).toBe('/ledger?day=sunny-weekday&hour=17')
  })

  it('updates the day type while preserving the selected start hour', () => {
    useEnergyStore.setState((state) => ({
      config: { ...state.config, startHour: 17 },
    }))
    renderSelector('/ledger?day=sunny-weekday&hour=17')

    fireEvent.click(screen.getByRole('button', { name: /cloudy/i }))

    expect(useEnergyStore.getState().dayType).toBe('cloudy')
    expect(useEnergyStore.getState().config.startHour).toBe(17)
    expect(screen.getByTestId('location').textContent).toBe('/ledger?day=cloudy&hour=17')
  })
})

describe('scenario link copy', () => {
  it('copies a URL containing the current day type and start hour', async () => {
    useEnergyStore.setState((state) => ({
      dayType: 'cloudy',
      config: { ...state.config, startHour: 17 },
    }))
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    renderSelector('/ledger?day=cloudy&hour=17')

    fireEvent.click(screen.getByRole('button', { name: 'COPY SCENARIO LINK' }))

    expect(writeText).toHaveBeenCalledTimes(1)
    const copied = new URL(writeText.mock.calls[0][0] as string)
    expect(copied.pathname).toBe('/ledger')
    expect(copied.searchParams.get('day')).toBe('cloudy')
    expect(copied.searchParams.get('hour')).toBe('17')
    expect(await screen.findByText('SCENARIO LINK COPIED')).toBeTruthy()
  })

  it('falls back to document copy when the clipboard API rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard unavailable'))
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn().mockReturnValue(true),
    })
    renderSelector()

    fireEvent.click(screen.getByRole('button', { name: 'COPY SCENARIO LINK' }))

    expect(await screen.findByText('SCENARIO LINK COPIED')).toBeTruthy()
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })
})
