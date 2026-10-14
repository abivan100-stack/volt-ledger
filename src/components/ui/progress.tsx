import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import './progress.css'

export const Progress = forwardRef<
  ElementRef<typeof ProgressPrimitive.Root>,
  ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={twMerge(clsx('volt-progress', className))}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="volt-progress-indicator"
      style={{ '--volt-progress': String(value ?? 0) } as React.CSSProperties}
    />
  </ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName
