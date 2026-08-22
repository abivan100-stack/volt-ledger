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

  it('gives the app-wide "skip to content" link something to land on', () => {
    // App.tsx renders `<a href="#main">` on every route; a 404 page with no
    // matching id leaves that link — and anyone using it — going nowhere.
    render(
      <MemoryRouter initialEntries={['/somewhere-else']}>
        <NotFoundPage />
      </MemoryRouter>,
    )

    expect(document.getElementById('main')).not.toBeNull()
  })
})
