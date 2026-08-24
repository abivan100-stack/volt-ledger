import { cva } from 'class-variance-authority'
import './button.css'

export const buttonVariants = cva('volt-btn', {
  variants: {
    variant: {
      default: 'volt-btn-default',
      volt: 'volt-btn-volt',
      destructive: 'volt-btn-destructive',
      outline: 'volt-btn-outline',
      secondary: 'volt-btn-secondary',
      ghost: 'volt-btn-ghost',
      link: 'volt-btn-link',
    },
    size: {
      default: 'volt-btn-md',
      sm: 'volt-btn-sm',
      lg: 'volt-btn-lg',
      icon: 'volt-btn-icon',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
})
