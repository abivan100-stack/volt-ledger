// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { Toaster } from '../toaster'
import { toast } from '../use-toast'

describe('Toast and Toaster components', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders dispatched toasts with title and description', () => {
    render(<Toaster />)

    act(() => {
      toast({
        title: 'Settlement Completed',
        description: 'Hourly peer credits balanced.',
        variant: 'volt',
      })
    })

    expect(screen.getByText('Settlement Completed')).toBeTruthy()
    expect(screen.getByText('Hourly peer credits balanced.')).toBeTruthy()
  })
})
