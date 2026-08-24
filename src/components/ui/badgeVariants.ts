import { cva } from 'class-variance-authority'
import './badge.css'

export const badgeVariants = cva('volt-badge', {
  variants: {
    variant: {
      default: 'volt-badge-default',
      volt: 'volt-badge-volt',
      sun: 'volt-badge-sun',
      destructive: 'volt-badge-destructive',
      outline: 'volt-badge-outline',
      secondary: 'volt-badge-secondary',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})
