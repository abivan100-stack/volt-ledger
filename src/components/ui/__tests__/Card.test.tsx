// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../card'

describe('Card components', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders a full card structure with header, title, content and footer', () => {
    render(
      <Card className="custom-card-class">
        <CardHeader>
          <CardTitle>Microgrid Node</CardTitle>
          <CardDescription>Household solar capacity</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Generation: 4.2 kW</p>
        </CardContent>
        <CardFooter>
          <span>Status: Active</span>
        </CardFooter>
      </Card>,
    )

    const title = screen.getByText('Microgrid Node')
    expect(title).toBeTruthy()
    expect(title.getAttribute('class')).toContain('volt-card-title')

    const description = screen.getByText('Household solar capacity')
    expect(description).toBeTruthy()
    expect(description.getAttribute('class')).toContain('volt-card-description')

    const content = screen.getByText('Generation: 4.2 kW')
    expect(content).toBeTruthy()

    const footer = screen.getByText('Status: Active')
    expect(footer).toBeTruthy()
  })
})
