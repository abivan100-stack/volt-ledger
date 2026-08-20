import { useState, type FormEvent } from 'react'
import { ApiError } from '../../api/errors'
import type { Organisation } from '../../api/organisations'
import { MIN_SLUG_LENGTH, isValidSlug, toSlug } from '../../lib/slug'
import { useOrganisationStore } from '../../store/useOrganisationStore'
import './CreateOrganisationForm.css'

interface CreateOrganisationFormProps {
  onCreated?: (organisation: Organisation) => void
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return 'The organisation could not be created.'
}

function CreateOrganisationForm({ onCreated }: CreateOrganisationFormProps) {
  const create = useOrganisationStore((state) => state.create)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  // Once the identifier has been typed into, it stops tracking the name — the
  // suggestion is a convenience, not something that should overwrite a choice.
  const [slugEdited, setSlugEdited] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleNameChange = (value: string): void => {
    setName(value)
    if (!slugEdited) setSlug(toSlug(value))
  }

  const handleSlugChange = (value: string): void => {
    setSlugEdited(true)
    setSlug(value)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!name.trim() || !slug || submitting) return

    if (!isValidSlug(slug)) {
      setError(
        `The identifier must be at least ${MIN_SLUG_LENGTH} characters of lower-case letters, digits, and single hyphens.`,
      )
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const created = await create({ name: name.trim(), slug })
      setName('')
      setSlug('')
      setSlugEdited(false)
      onCreated?.(created)
    } catch (caught) {
      setError(messageFor(caught))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="account-form organisation-create" onSubmit={handleSubmit} noValidate>
      <label className="account-field">
        <span className="mono account-field-label">NAME</span>
        <input
          className="account-input"
          type="text"
          name="organisationName"
          value={name}
          onChange={(event) => handleNameChange(event.target.value)}
        />
      </label>

      <label className="account-field">
        <span className="mono account-field-label">IDENTIFIER</span>
        <input
          className="account-input mono"
          type="text"
          name="organisationSlug"
          value={slug}
          onChange={(event) => handleSlugChange(event.target.value)}
        />
        <span className="account-field-hint">
          Lower-case letters, digits, and single hyphens. Used in URLs and cannot clash with another
          organisation.
        </span>
      </label>

      {error !== null && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}

      <button className="mono account-submit" type="submit" disabled={submitting} aria-busy={submitting}>
        {submitting ? 'CREATE ORGANISATION…' : 'CREATE ORGANISATION'}
      </button>
    </form>
  )
}

export default CreateOrganisationForm
