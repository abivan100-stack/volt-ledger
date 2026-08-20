import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import Header from '../components/sections/Header'
import AcceptInvitation from '../components/account/AcceptInvitation'
import './InvitationAcceptPage.css'

/** Landing page for the `/invite/accept?token=…` link sent in invitation emails. */
function InvitationAcceptPage() {
  const [searchParams] = useSearchParams()

  useEffect(() => {
    document.title = 'Volt — Accept Invitation'
  }, [])

  return (
    <>
      <Header />
      <main className="invite-page" id="main">
        <div className="container invite-page-inner">
          <p className="mono invite-page-kicker">VOLT / INVITATION</p>
          <h1 className="serif invite-page-heading">Join an organisation</h1>
          <AcceptInvitation token={searchParams.get('token')} />
        </div>
      </main>
    </>
  )
}

export default InvitationAcceptPage
