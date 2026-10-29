import { useEffect, useState, type FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  LoaderCircle,
  Mail,
  ShieldCheck,
} from 'lucide-react'
import { api } from './api'
import './account-security.css'

type Action = (work: () => Promise<void>, success?: string) => Promise<void>
export function AccountRecoveryView({ token }: { token?: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [done, setDone] = useState(false)
  useEffect(() => {
    setError('')
    setMessage('')
    setDone(false)
  }, [token])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    setError('')
    setMessage('')
    if (token && fields.get('password') !== fields.get('confirmation')) {
      setError('Your passwords do not match. Enter the same new password in both fields.')
      return
    }
    setBusy(true)
    try {
      const result = await api<{ message: string }>(
        token ? '/auth/reset' : '/auth/request-reset',
        'POST',
        token
          ? { token, password: fields.get('password') }
          : { email: String(fields.get('email') || '').trim() },
      )
      setMessage(result.message)
      setDone(true)
      if (token) {
        const clean = new URL(window.location.href)
        clean.searchParams.delete('reset')
        window.history.replaceState(null, '', clean.pathname + clean.search + clean.hash)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="workspace account-recovery">
      <a className="ws-logo" href="/">
        <span>jh.</span> Job-Hunter
      </a>
      <div className="account-recovery-layout">
        <div className="account-recovery-story">
          <p className="ws-eyebrow">YOUR NEXT CHAPTER IS STILL HERE</p>
          <h1>
            A fresh start,
            <br />a familiar space.
          </h1>
          <p>Recover your account and pick up your search where you left it.</p>
          <div className="account-security-note">
            <ShieldCheck size={20} />
            <p>Your recovery link expires after 30 minutes and can be used once.</p>
          </div>
        </div>
        <section className="ws-panel account-recovery-card" aria-labelledby="recovery-title">
          <span className="account-security-icon">
            {done ? (
              <CheckCircle2 size={26} />
            ) : token ? (
              <KeyRound size={26} />
            ) : (
              <Mail size={26} />
            )}
          </span>
          <h2 id="recovery-title">
            {done
              ? token
                ? 'Your password is updated.'
                : 'Check your inbox.'
              : token
                ? 'Choose a new password.'
                : 'Let’s get you back in.'}
          </h2>
          {done ? (
            <>
              <p role="status" className="account-security-message">
                {message}
              </p>
              <a href="/app" className="ws-button ws-primary">
                Return to sign in
                <ArrowRight size={16} />
              </a>
              {!token && (
                <button
                  type="button"
                  className="ws-text-button"
                  onClick={() => {
                    setDone(false)
                    setMessage('')
                  }}
                >
                  Try another email address
                </button>
              )}
            </>
          ) : (
            <form onSubmit={(event) => void submit(event)}>
              <p>
                {token
                  ? 'Use a unique password with at least 10 characters. Changing it signs out existing sessions and application assistants.'
                  : 'Enter the email address you used for your workspace. We’ll send a recovery link if an account exists and email delivery is available.'}
              </p>
              {token ? (
                <>
                  <label className="ws-field">
                    <span>New password</span>
                    <input
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      minLength={10}
                      maxLength={128}
                      required
                      disabled={busy}
                      aria-describedby="password-length"
                    />
                    <small id="password-length">10 to 128 characters.</small>
                  </label>
                  <label className="ws-field">
                    <span>Confirm new password</span>
                    <input
                      name="confirmation"
                      type="password"
                      autoComplete="new-password"
                      minLength={10}
                      maxLength={128}
                      required
                      disabled={busy}
                    />
                  </label>
                </>
              ) : (
                <label className="ws-field">
                  <span>Email address</span>
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    disabled={busy}
                  />
                </label>
              )}
              {error && (
                <p role="alert" className="ws-error">
                  {error}
                </p>
              )}
              <button className="ws-button ws-primary" type="submit" disabled={busy}>
                {busy ? <LoaderCircle className="ws-spin" size={16} /> : null}
                {busy ? 'Please wait…' : token ? 'Update password' : 'Send recovery link'}
                <ArrowRight size={16} />
              </button>
              {token && error && (
                <a href="/app?recovery=1" className="ws-text-button">
                  Request a new recovery link
                </a>
              )}
            </form>
          )}
          <a className="account-back-link" href="/app">
            <ArrowLeft size={14} />
            Back to your workspace
          </a>
        </section>
      </div>
    </main>
  )
}
export function VerificationNotice({
  verified,
  required,
  act,
  onChanged,
}: {
  verified: boolean
  required: boolean
  act: Action
  onChanged: () => Promise<void>
}) {
  const [sending, setSending] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('')
  if (verified) return null
  return (
    <section className="account-verification" aria-label="Email verification">
      <div className="account-verification-copy">
        <Mail size={20} />
        <div>
          <strong>
            {required
              ? 'Verify your email to unlock your workspace.'
              : 'Keep your account within reach.'}
          </strong>
          <p>
            {required
              ? 'Open the verification link sent to your inbox. Request another email below if needed.'
              : 'Verify your email so your account is ready for secure recovery.'}
          </p>
          {message && <p role="status">{message}</p>}
          {error && (
            <p role="alert" className="ws-error">
              {error}
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        className="ws-button"
        disabled={sending}
        onClick={() =>
          void act(async () => {
            setSending(true)
            setError('')
            setMessage('')
            try {
              const result = await api<{ message: string }>('/auth/send-verification', 'POST')
              setMessage(result.message)
              await onChanged()
            } catch (err) {
              setError((err as Error).message)
            } finally {
              setSending(false)
            }
          })
        }
      >
        {sending ? <LoaderCircle size={15} className="ws-spin" /> : <Mail size={15} />}{' '}
        {sending ? 'Sending…' : 'Send verification email'}
      </button>
    </section>
  )
}
