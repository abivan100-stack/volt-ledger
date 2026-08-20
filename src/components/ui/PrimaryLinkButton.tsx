
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import './PrimaryLinkButton.css'

interface PrimaryLinkButtonProps {
  to: string
  children: ReactNode
}

/** The dark ink-background CTA button style, identical on Hero and LedgerCta. */
function PrimaryLinkButton({ to, children }: PrimaryLinkButtonProps) {
  return (
    <Link to={to} className="mono primary-link-button">
      {children}
    </Link>
  )
}

export default PrimaryLinkButton
