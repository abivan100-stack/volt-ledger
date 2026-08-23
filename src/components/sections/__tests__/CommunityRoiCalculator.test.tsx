// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import CommunityRoiCalculator from '../CommunityRoiCalculator'

afterEach(() => {
  cleanup()
})

describe('CommunityRoiCalculator component', () => {
  it('renders section headings and default prosumer calculations', () => {
    render(<CommunityRoiCalculator />)

    expect(screen.getByText(/What if/i).textContent).toBeTruthy()
    expect(screen.getByText(/YOUR HOUSEHOLD PROFILE/i).textContent).toBeTruthy()
    expect(screen.getByText(/RECOMMENDED SYSTEM/i).textContent).toBeTruthy()
    expect(screen.getByText(/ESTIMATED PAYBACK/i).textContent).toBeTruthy()
  })

  it('updates outputs when bill slider changes', () => {
    render(<CommunityRoiCalculator />)

    const billSlider = screen.getByLabelText(/MONTHLY ELECTRICITY BILL/i)
    fireEvent.change(billSlider, { target: { value: '8000' } })

    expect(screen.getByText(/₹8,000/).textContent).toBeTruthy()
  })

  it('switches to Apartment / Renter Mode when roof area is set to 0', () => {
    render(<CommunityRoiCalculator />)

    const roofSlider = screen.getByLabelText(/USABLE ROOFTOP SPACE/i)
    fireEvent.change(roofSlider, { target: { value: '0' } })

    expect(screen.getByText(/APARTMENT \/ TENANT MODE/i).textContent).toBeTruthy()
    expect(screen.getByText(/Save money without installing panels/i).textContent).toBeTruthy()
  })

  it('switches back to prosumer breakdown when roof area is increased', () => {
    render(<CommunityRoiCalculator />)

    const roofSlider = screen.getByLabelText(/USABLE ROOFTOP SPACE/i)
    fireEvent.change(roofSlider, { target: { value: '0' } })
    expect(screen.getByText(/APARTMENT \/ TENANT MODE/i).textContent).toBeTruthy()

    fireEvent.change(roofSlider, { target: { value: '45' } })
    expect(screen.getByText(/RECOMMENDED SYSTEM/i).textContent).toBeTruthy()
    expect(screen.getByText(/PM Surya Ghar Subsidy/i).textContent).toBeTruthy()
  })
})
