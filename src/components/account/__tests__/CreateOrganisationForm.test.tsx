// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import CreateOrganisationForm from '../CreateOrganisationForm'
import { useOrganisationStore } from '../../../store/useOrganisationStore'
import { ApiError } from '../../../api/errors'
import type { Organisation } from '../../../api/organisations'

const { listMock, createMock, archiveMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  createMock: vi.fn(),
  archiveMock: vi.fn(),
}))

vi.mock('../../../api/organisations', () => ({
  listOrganisations: listMock,
  createOrganisation: createMock,
  archiveOrganisation: archiveMock,
}))

const CREATED: Organisation = {
  id: 'org-a',
  name: 'Nolambur Microgrid',
  slug: 'nolambur-microgrid',
  role: 'owner',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

const pristine = useOrganisationStore.getState()

beforeEach(() => {
  useOrganisationStore.setState(pristine, true)
  createMock.mockReset()
})

afterEach(() => {
  cleanup()
})

function nameField(): HTMLInputElement {
  return screen.getByLabelText(/^name/i) as HTMLInputElement
}

function slugField(): HTMLInputElement {
  return screen.getByLabelText(/identifier/i) as HTMLInputElement
}

function submitButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /create organisation/i }) as HTMLButtonElement
}

describe('CreateOrganisationForm', () => {
  it('derives the identifier from the name as it is typed', () => {
    render(<CreateOrganisationForm />)

    fireEvent.change(nameField(), { target: { value: 'Nolambur Microgrid' } })
    expect(slugField().value).toBe('nolambur-microgrid')
  })

  it('stops deriving once the identifier is edited by hand', () => {
    render(<CreateOrganisationForm />)

    fireEvent.change(nameField(), { target: { value: 'Nolambur Microgrid' } })
    fireEvent.change(slugField(), { target: { value: 'nolambur' } })
    fireEvent.change(nameField(), { target: { value: 'Nolambur Microgrid North' } })

    expect(slugField().value).toBe('nolambur')
  })

  it('creates the organisation and selects it', async () => {
    createMock.mockResolvedValue(CREATED)
    render(<CreateOrganisationForm />)

    fireEvent.change(nameField(), { target: { value: 'Nolambur Microgrid' } })
    fireEvent.click(submitButton())

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
    expect(createMock).toHaveBeenCalledWith({
      name: 'Nolambur Microgrid',
      slug: 'nolambur-microgrid',
    })
    expect(useOrganisationStore.getState().selectedId).toBe(CREATED.id)
  })

  it('notifies its caller once the organisation exists', async () => {
    createMock.mockResolvedValue(CREATED)
    const onCreated = vi.fn()
    render(<CreateOrganisationForm onCreated={onCreated} />)

    fireEvent.change(nameField(), { target: { value: 'Nolambur Microgrid' } })
    fireEvent.click(submitButton())

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(CREATED))
  })

  it('rejects an identifier the server would refuse before sending it', () => {
    render(<CreateOrganisationForm />)

    fireEvent.change(nameField(), { target: { value: 'Ab' } })
    fireEvent.change(slugField(), { target: { value: 'ab' } })
    fireEvent.click(submitButton())

    expect(createMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/identifier/i)
  })

  it('reports a slug already taken by another organisation', async () => {
    createMock.mockRejectedValue(
      new ApiError({
        message: 'An organisation with this slug already exists',
        status: 409,
        code: 'ORGANISATION_SLUG_CONFLICT',
      }),
    )
    render(<CreateOrganisationForm />)

    fireEvent.change(nameField(), { target: { value: 'Nolambur Microgrid' } })
    fireEvent.click(submitButton())

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/already exists/i)
    expect(nameField().value).toBe('Nolambur Microgrid')
  })

  it('disables the submit control while the request is in flight', async () => {
    let release: (value: Organisation) => void = () => {}
    createMock.mockReturnValue(
      new Promise<Organisation>((resolve) => {
        release = resolve
      }),
    )
    render(<CreateOrganisationForm />)

    fireEvent.change(nameField(), { target: { value: 'Nolambur Microgrid' } })
    fireEvent.click(submitButton())

    await waitFor(() => expect(submitButton().disabled).toBe(true))
    release(CREATED)
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
  })

  it('does not submit an empty form', () => {
    render(<CreateOrganisationForm />)
    fireEvent.click(submitButton())
    expect(createMock).not.toHaveBeenCalled()
  })
})
