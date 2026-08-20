import { useEffect } from 'react'
import Header from '../components/sections/Header'
import AccountPanel from '../components/account/AccountPanel'
import './AccountPage.css'

function AccountPage() {
  useEffect(() => {
    document.title = 'Volt — Account'
  }, [])

  return (
    <>
      <Header />
      <main className="account-page" id="main">
        <div className="container account-page-inner">
          <p className="mono account-page-kicker">VOLT / ACCOUNT</p>
          <h1 className="serif account-page-heading">Your Volt account</h1>
          <p className="account-page-body">
            Signing in gives you organisations, simulation runs, and the server-owned settlement
            ledger. The public demo needs no account and is unaffected by anything on this page.
          </p>
          <AccountPanel />
        </div>
      </main>
    </>
  )
}

export default AccountPage
