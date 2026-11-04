import { useEffect, useState } from 'react'
import { Bell, Check, LoaderCircle } from 'lucide-react'
import type { Job } from '../../shared/types'
import type { DeadlineAlert } from '../../shared/matching'
import { api } from './api'
const localValue = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
export function JobAlertForm({ job }: { job: Job }) {
  const [deadline, setDeadline] = useState(
      job.deadlineAt ? localValue(new Date(job.deadlineAt)) : '',
    ),
    [remind, setRemind] = useState(
      job.deadlineAt
        ? localValue(new Date(Math.max(Date.now(), Date.parse(job.deadlineAt) - 86400000)))
        : '',
    ),
    [email, setEmail] = useState(false),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false)
  useEffect(() => {
    void api<{ emailReady: boolean; alerts: DeadlineAlert[] }>('/alerts')
      .then((r) => {
        setReady(r.emailReady)
        const prior = r.alerts.find((a) => a.jobId === job.id)
        if (prior) {
          setDeadline(localValue(new Date(prior.deadlineAt)))
          setRemind(localValue(new Date(prior.remindAt)))
          setEmail(prior.emailEnabled)
        }
      })
      .catch((e) => setError(e.message))
  }, [job.id])
  return (
    <section className="jh-alert-form">
      <h3>Keep the deadline in view</h3>
      <p className="ws-muted">
        {job.deadlineAt
          ? `The employer listing supplies ${job.deadlineAt}. Confirm its timezone and closing time before saving.`
          : 'No deadline was supplied by this listing. Enter one only if you confirm it with the employer.'}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!Number.isFinite(Date.parse(deadline)) || !Number.isFinite(Date.parse(remind))) {
            setError('Choose a valid deadline and reminder time.')
            return
          }
          setBusy(true)
          setError('')
          setSaved(false)
          void api('/alerts', 'POST', {
            jobId: job.id,
            deadlineAt: new Date(deadline).toISOString(),
            remindAt: new Date(remind).toISOString(),
            emailEnabled: email,
          })
            .then(() => setSaved(true))
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false))
        }}
      >
        <label>
          Application deadline (your local time)
          <input
            type="datetime-local"
            required
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </label>
        <label>
          Remind me (your local time)
          <input
            type="datetime-local"
            required
            value={remind}
            onChange={(e) => setRemind(e.target.value)}
          />
        </label>
        <label className="ws-check">
          <input
            type="checkbox"
            checked={email}
            disabled={!ready || busy}
            onChange={(e) => setEmail(e.target.checked)}
          />{' '}
          Also email my verified sign-in address
        </label>
        <p className="ws-muted">
          {ready
            ? 'Email is optional.'
            : 'Email delivery is not configured; in-app reminders still work.'}{' '}
          Reminders depend on server availability; the free host can sleep and delay email.
        </p>
        <button className="ws-button ws-primary" disabled={busy}>
          {busy ? (
            <LoaderCircle className="ws-spin" size={16} />
          ) : saved ? (
            <Check size={16} />
          ) : (
            <Bell size={16} />
          )}{' '}
          {saved ? 'Reminder saved' : 'Save reminder'}
        </button>
        {error && (
          <p role="alert" className="ws-error">
            {error}
          </p>
        )}
      </form>
    </section>
  )
}
export function AlertsView() {
  const [alerts, setAlerts] = useState<DeadlineAlert[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true)
  const load = async () => setAlerts((await api<{ alerts: DeadlineAlert[] }>('/alerts')).alerts)
  useEffect(() => {
    void load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])
  const work = async (path: string, method: string, body?: unknown) => {
    setBusy(true)
    setError('')
    try {
      await api(path, method, body)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="jh-alerts">
      <div className="jh-page-title">
        <div>
          <h1>Deadlines & reminders</h1>
          <p>Important dates for the opportunities you choose to track.</p>
        </div>
        <button
          className="ws-button"
          disabled={busy}
          onClick={() => void load().catch((e) => setError(e.message))}
        >
          Refresh
        </button>
      </div>
      {error && (
        <p role="alert" className="ws-error">
          {error}
        </p>
      )}
      {loading && <p role="status">Loading your reminders…</p>}
      {!loading && !alerts.length && (
        <div className="ws-empty">
          <Bell size={28} />
          <h3>No reminders yet</h3>
          <p>
            Open a job and choose Deadline to save one. Saving a job with an exact employer expiry
            also creates an in-app reminder.
          </p>
        </div>
      )}
      {alerts.map((a) => (
        <article className="jh-alert-row" key={a.id}>
          <Bell size={20} />
          <div>
            <small>
              {a.due && !a.readAt ? 'Reminder due' : a.readAt ? 'Read' : 'Upcoming'} ·{' '}
              {a.provenance === 'employer' ? 'Employer-supplied expiry' : 'User-confirmed deadline'}
            </small>
            <h3>{a.title}</h3>
            <p>
              {a.company} · Deadline {new Date(a.deadlineAt).toLocaleString()}
            </p>
            <p className="ws-muted">
              Reminder {new Date(a.remindAt).toLocaleString()} ·{' '}
              {a.emailEnabled ? (a.sentAt ? 'Email sent' : 'Email enabled') : 'In-app only'}
            </p>
            {a.error && <p className="ws-error">{a.error}</p>}
            <a href={a.url} target="_blank" rel="noopener noreferrer">
              Check employer page ↗
            </a>
          </div>
          <div className="jh-alert-actions">
            {!a.readAt && (
              <button
                className="ws-button"
                disabled={busy}
                onClick={() => void work(`/alerts/${a.id}`, 'PATCH', { read: true })}
              >
                Mark read
              </button>
            )}
            <button
              className="ws-text-button"
              disabled={busy}
              onClick={() => void work(`/alerts/${a.id}`, 'DELETE')}
            >
              Cancel reminder
            </button>
          </div>
        </article>
      ))}
    </section>
  )
}
