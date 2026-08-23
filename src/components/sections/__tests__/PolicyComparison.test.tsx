// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import PolicyComparison from '../PolicyComparison'

afterEach(() => {
  cleanup()
})

describe('PolicyComparison component', () => {
  it('renders regulatory comparison table and citations', () => {
    render(<PolicyComparison />)

    expect(screen.getByText(/Bridging the/i).textContent).toBeTruthy()
    expect(screen.getByText(/TANGEDCO NET-FEED TARIFF/i).textContent).toBeTruthy()
    expect(screen.getByText(/VOLT P2P MICROGRID/i).textContent).toBeTruthy()
    expect(screen.getByText(/PROSUMER EXPORT TARIFF/i).textContent).toBeTruthy()
    expect(screen.getByText(/CERC P2P Discussion Framework/i).textContent).toBeTruthy()
    expect(screen.getByText(/Tamil Nadu Solar Policy 2019/i).textContent).toBeTruthy()
  })
})
