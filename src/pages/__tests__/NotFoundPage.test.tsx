// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import NotFoundPage from '../NotFoundPage'

afterEach(cleanup)

describe('NotFoundPage', () => {
  it('gives an unknown route a clear recovery path', () => {
    render(
      <MemoryRouter initialEntries={['/somewhere-else']}>
        <NotFoundPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: "This street doesn't lead anywhere." })).toBeTruthy()
    expect(screen.getByText(/NO ROUTE FOUND/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /back to homepage/i }).getAttribute('href')).toBe('/')
    expect(screen.getByRole('link', { name: /open live ledger/i }).getAttribute('href')).toBe('/ledger')
  })
})
