import { useEffect } from 'react'
import Header from '../components/sections/Header'
import AccountPanel from '../components/account/AccountPanel'
import OrganisationPanel from '../components/account/OrganisationPanel'
import './AccountPage.css'

function AccountPage() {
  useEffect(() => {
    document.title = 'Volt — Account'
  }, [])

  return (
    <>
      <Header />
      <main className="account-page" id="account-page">
        <div className="container account-page-inner">
          <div className="account-page-card">
            <p className="mono account-page-kicker">VOLT / ACCOUNT</p>
            <h1 className="serif account-page-heading">Your Volt account</h1>
            <p className="account-page-body">
              Signing in gives you organisations, simulation runs, and the server-owned settlement
              ledger. The public demo needs no account and is unaffected by anything on this page.
            </p>
            <AccountPanel />
            <OrganisationPanel />
          </div>
        </div>
      </main>
    </>
  )
}

export default AccountPage
