import { useState } from 'react'
import { closeAccount } from '../../api/session'
import { getApiErrorMessage } from '../../api/errors'
import './CloseAccount.css'

/**
 * Closing your own account.
 *
 * Behind a confirmation, because it cannot be undone and nobody can undo it for
 * you — there is no administrator (ADR 0011). The confirmation states what
 * survives, since "delete my account" and what actually happens are not the same
 * thing here: the ledger keeps its record of who accepted a settlement, as an
 * identifier that no longer reaches a person.
 */

interface CloseAccountProps {
  /** Called once the account is closed, so the session can be discarded. */
  onClosed?: () => void
}

function CloseAccount({ onClosed }: CloseAccountProps) {
  const [confirming, setConfirming] = useState(false)
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClose = async (): Promise<void> => {
    setClosing(true)
    setError(null)
    try {
      await closeAccount()
      onClosed?.()
    } catch (caught) {
      setError(getApiErrorMessage(caught, 'The account could not be closed.'))
      setConfirming(false)
    } finally {
      setClosing(false)
    }
  }

  return (
    <div className="close-account">
      {!confirming && (
        <button
          className="mono close-account-action"
          type="button"
          onClick={() => {
            setConfirming(true)
            setError(null)
          }}
        >
          CLOSE ACCOUNT
        </button>
      )}

      {confirming && (
        <div className="close-account-confirm" role="group" aria-label="Confirm closing the account">
          <p className="close-account-warning">
            This cannot be undone, and no one can undo it for you. Your name and address are removed
            and you are signed out everywhere. Settlement records keep the identifier that accepted
            them, which will no longer lead back to you.
          </p>
          <button
            className="mono close-account-action close-account-confirmed"
            type="button"
            onClick={() => void handleClose()}
            disabled={closing}
            aria-busy={closing}
          >
            {closing ? 'CLOSE ACCOUNT…' : 'YES, CLOSE MY ACCOUNT'}
          </button>
          <button
            className="mono account-secondary-action"
            type="button"
            onClick={() => setConfirming(false)}
            disabled={closing}
          >
            KEEP MY ACCOUNT
          </button>
        </div>
      )}

      {error !== null && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export default CloseAccount
