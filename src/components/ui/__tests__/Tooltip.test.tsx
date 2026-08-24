// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../tooltip'

describe('Tooltip components', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders trigger element inside provider', () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button">Audit Hash</button>
          </TooltipTrigger>
          <TooltipContent>
            <span>Block #42 SHA-256</span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    )

    const trigger = screen.getByRole('button', { name: 'Audit Hash' })
    expect(trigger).toBeTruthy()
  })
})
