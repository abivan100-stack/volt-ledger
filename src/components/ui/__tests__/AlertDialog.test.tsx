// @vitest-environment happy-dom
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../AlertDialog'

afterEach(() => {
  cleanup()
})

function DialogFixture() {
  const [open, setOpen] = useState(false)

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <button type="button">Open confirmation</button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm the change</AlertDialogTitle>
          <AlertDialogDescription>This action needs an explicit confirmation.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <button type="button">Cancel</button>
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

describe('AlertDialog', () => {
  it('exposes an accessible alert dialog with its title and description', () => {
    render(<DialogFixture />)

    fireEvent.click(screen.getByRole('button', { name: /open confirmation/i }))

    const dialog = screen.getByRole('alertdialog', { name: 'Confirm the change' })
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy()
    expect(screen.getByText(/explicit confirmation/i)).toBeTruthy()
  })

  it('closes on Escape and restores focus to its trigger', async () => {
    render(<DialogFixture />)
    const trigger = screen.getByRole('button', { name: /open confirmation/i })

    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })
})
