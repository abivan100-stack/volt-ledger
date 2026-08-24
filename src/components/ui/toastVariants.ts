import { cva } from 'class-variance-authority'
import './toast.css'

export const toastVariants = cva('volt-toast', {
  variants: {
    variant: {
      default: 'volt-toast-default',
      volt: 'volt-toast-volt',
      destructive: 'volt-toast-destructive',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})
