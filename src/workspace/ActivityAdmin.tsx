import { useCallback, useEffect, useState } from 'react'
import { Activity, ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react'
import { api } from './api'
import { smallAccessSummary } from './Billing'
import type { ActivityOverview, ActivityDetail, ActivitySettings } from '../../shared/activity'
import './activity.css'
type Props = {
  act: (work: () => Promise<void>, success?: string) => Promise<void>
  busy: boolean
  onChanged: () => Promise<void>
}
const date = (value: string | null) =>
  value ? new Date(value).toLocaleString('en-IN') : 'Not observed yet'
function Pager({
  offset,
  total,
  onChange,
  label,
}: {
  offset: number
  total: number
  onChange: (v: number) => void
  label: string
}) {
  return (
    <nav className="activity-pagination" aria-label={label}>
      <button
        type="button"
        className="ws-button"
        disabled={!offset}
        onClick={() => onChange(Math.max(0, offset - 25))}
      >
        <ArrowLeft size={14} /> Previous
      </button>
      <span>
        {total ? `${offset + 1}–${Math.min(offset + 25, total)} of ${total}` : 'No records'}
      </span>
      <button
        type="button"
        className="ws-button"
        disabled={offset + 25 >= total}
        onClick={() => onChange(offset + 25)}
      >
        Next <ArrowRight size={14} />
      </button>
    </nav>
  )
}
export function ActivityAdmin({ act, busy, onChanged }: Props) {
  const [data, setData] = useState<ActivityOverview | null>(null),
    [query, setQuery] = useState(''),
    [offset, setOffset] = useState(0),
    [error, setError] = useState('')
  const [draft, setDraft] = useState<ActivitySettings | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [detail, setDetail] = useState<ActivityDetail | null>(null),
    [detailError, setDetailError] = useState(''),
    [historyOffset, setHistoryOffset] = useState(0),
    [tab, setTab] = useState<'events' | 'runs'>('events')
  const load = useCallback(
    async () =>
      api<ActivityOverview>(`/admin/activity?q=${encodeURIComponent(query)}&offset=${offset}`),
    [query, offset],
  )
  useEffect(() => {
    let cancelled = false
    const refresh = () =>
      void load()
        .then((next) => {
          if (!cancelled) {
            setData(next)
            setDraft((d) => d || next.settings)
            setError('')
          }
        })
        .catch((e) => {
          if (!cancelled) setError(e.message)
        })
    const delay = setTimeout(refresh, 250),
      timer = setInterval(refresh, 30000)
    return () => {
      cancelled = true
      clearTimeout(delay)
      clearInterval(timer)
    }
  }, [load])
  useEffect(() => {
    if (!selected) return
    let cancelled = false
    const refresh = () =>
      void api<ActivityDetail>(
        `/admin/activity/users/${encodeURIComponent(selected)}?offset=${historyOffset}`,
      )
        .then((d) => {
          if (!cancelled) {
            setDetail(d)
            setDetailError('')
          }
        })
        .catch((e) => {
          if (!cancelled) setDetailError(e.message)
        })
    refresh()
    const timer = setInterval(refresh, 30000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [selected, historyOffset])
  async function refresh() {
    setData(await load())
    if (selected)
      setDetail(
        await api<ActivityDetail>(
          `/admin/activity/users/${encodeURIComponent(selected)}?offset=${historyOffset}`,
        ),
      )
    await onChanged()
  }
  const dirty =
    draft &&
    data &&
    (draft.enabled !== data.settings.enabled || draft.retentionDays !== data.settings.retentionDays)
  return (
    <section className="activity-admin" aria-labelledby="activity-title">
      <div className="activity-heading">
        <div>
          <p className="ws-eyebrow">FIRST-PARTY INSIGHTS</p>
          <h2 id="activity-title">People & activity</h2>
          <p>Account activity, observed presence, and discovery runs in one place.</p>
        </div>
        <button
          type="button"
          className="ws-button"
          disabled={busy}
          onClick={() => void act(refresh)}
        >
          <RefreshCw size={15} /> Refresh activity
        </button>
      </div>
      {error && (
        <p className="ws-error" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <p role="status">Loading account activity…</p>
      ) : (
        <>
          <div className="activity-metrics">
            {[
              [
                data.settings.enabled ? 'Active now' : 'Presence paused',
                data.settings.enabled ? data.activeUsers : '—',
              ],
              ['Registered accounts', data.totalUsers],
              ['Discovery runs', data.totalRuns],
            ].map(([label, value]) => (
              <div className="ws-panel" key={label}>
                <span>{label}</span>
                <strong>{typeof value === 'number' ? value.toLocaleString('en-IN') : value}</strong>
              </div>
            ))}
          </div>
          <p className="ws-muted activity-explainer">
            Active means a visible workspace with interaction in the last{' '}
            {data.activeWindowSeconds / 60} minutes. Missing heartbeats expire after{' '}
            {data.heartbeatGraceSeconds} seconds. Browser signals are approximate; blocked scripts,
            closed tabs or network loss can hide activity. Scan counts come from server records,
            including historical runs.
          </p>
          {draft && (
            <form
              className="ws-panel activity-controls"
              onSubmit={(e) => {
                e.preventDefault()
                void act(async () => {
                  await api('/admin/activity/settings', 'PATCH', draft)
                  await refresh()
                }, 'Activity settings saved.')
              }}
            >
              <label className="ws-check">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                />{' '}
                Collect workspace presence & page views
              </label>
              <label className="ws-field">
                <span>Activity retention in days</span>
                <input
                  type="number"
                  min={7}
                  max={365}
                  required
                  value={draft.retentionDays}
                  onChange={(e) => setDraft({ ...draft, retentionDays: Number(e.target.value) })}
                />
                <small>
                  7–365 days. Reducing this deletes older activity. Run totals and billing records
                  remain.
                </small>
              </label>
              <p className="ws-muted">
                Server operation records remain enabled for account traceability. No resume text,
                form answers, passwords, tokens, full URLs, raw IPs or fingerprints are collected in
                activity records.
              </p>
              <button type="submit" className="ws-button ws-primary" disabled={busy || !dirty}>
                Save activity settings
              </button>
            </form>
          )}
          <div className="ws-panel">
            <div className="activity-heading">
              <h3>Usage by account</h3>
              <label className="ws-field">
                <span>Find activity account</span>
                <input
                  type="search"
                  placeholder="Name, email or user ID"
                  maxLength={100}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setOffset(0)
                  }}
                />
              </label>
            </div>
            <div className="activity-accounts">
              {data.users.map((u) => (
                <article
                  className={`activity-account ${selected === u.id ? 'activity-selected' : ''}`}
                  key={u.id}
                >
                  <div className="activity-account-top">
                    <div>
                      <h4>{u.name}</h4>
                      <p>{u.email}</p>
                      <code>{u.id}</code>
                    </div>
                    <span className={`activity-presence ${u.active ? 'activity-online' : ''}`}>
                      {u.active ? 'Active now' : 'Offline / unobserved'}
                    </span>
                  </div>
                  <p className="ws-muted">
                    {smallAccessSummary(u.entitlements)} · Last seen: {date(u.lastSeen)}
                    {u.page ? ` · ${u.page}` : ''}
                  </p>
                  <dl className="activity-usage">
                    <div>
                      <dt>Total scans</dt>
                      <dd>{u.totalRuns}</dd>
                    </div>
                    <div>
                      <dt>Successful / partial</dt>
                      <dd>{u.successfulRuns}</dd>
                    </div>
                    <div>
                      <dt>Failed</dt>
                      <dd>{u.failedRuns}</dd>
                    </div>
                    <div>
                      <dt>Running</dt>
                      <dd>{u.runningRuns}</dd>
                    </div>
                    <div>
                      <dt>Free quota used</dt>
                      <dd>
                        {u.entitlements.freeRunsUsed} / {u.entitlements.freeRunsLimit}
                      </dd>
                    </div>
                    <div>
                      <dt>AI attempts</dt>
                      <dd>{u.aiAttempts}</dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    className="ws-button"
                    onClick={() => {
                      setDetail(null)
                      setDetailError('')
                      setSelected(u.id)
                      setHistoryOffset(0)
                      setTab('events')
                    }}
                  >
                    <Activity size={15} /> View activity for {u.name}
                  </button>
                </article>
              ))}
            </div>
            {!data.users.length && <p>No accounts match this search.</p>}
            <Pager
              offset={offset}
              total={data.matchedUsers}
              onChange={setOffset}
              label="Account pages"
            />
          </div>
          {selected && (
            <section className="ws-panel activity-history" aria-label="Account activity detail">
              <div className="activity-heading">
                <div>
                  <p className="ws-eyebrow">ACCOUNT TIMELINE</p>
                  <h3>{detail?.user.name || 'Loading history…'}</h3>
                </div>
                <button
                  type="button"
                  className="ws-button"
                  onClick={() => {
                    setSelected(null)
                    setDetail(null)
                  }}
                >
                  Close history
                </button>
              </div>
              {detailError && (
                <p role="alert" className="ws-error">
                  {detailError}
                </p>
              )}
              {detail && (
                <>
                  <p className="ws-muted">
                    Activity is retained for {detail.retentionDays} days. Older server run history
                    is retained separately. Browser reports are observations, not proof of work or
                    completed applications.
                  </p>
                  <div className="activity-tabs" role="group" aria-label="History type">
                    <button
                      type="button"
                      className="ws-button"
                      aria-pressed={tab === 'events'}
                      onClick={() => {
                        setTab('events')
                        setHistoryOffset(0)
                      }}
                    >
                      Activity events
                    </button>
                    <button
                      type="button"
                      className="ws-button"
                      aria-pressed={tab === 'runs'}
                      onClick={() => {
                        setTab('runs')
                        setHistoryOffset(0)
                      }}
                    >
                      Discovery run history
                    </button>
                  </div>
                  {tab === 'events' ? (
                    <ol className="activity-timeline">
                      {detail.events.map((e) => (
                        <li key={e.id}>
                          <div>
                            <strong>{e.action.replaceAll('.', ' ').replaceAll('_', ' ')}</strong>
                            <time dateTime={e.at}>{date(e.at)}</time>
                          </div>
                          <p>
                            {e.source === 'browser' ? 'Browser observation' : 'Server operation'}
                            {e.page ? ` · ${e.page}` : ''}
                            {e.status != null ? ` · HTTP ${e.status}` : ''}
                          </p>
                          {e.actorId !== detail.user.id && (
                            <p>
                              Actor: <code>{e.actorId}</code>
                            </p>
                          )}
                          {e.resourceId && (
                            <p>
                              Record: <code>{e.resourceId}</code>
                            </p>
                          )}
                          {e.requestId && (
                            <p>
                              Request: <code>{e.requestId}</code>
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <ol className="activity-timeline">
                      {detail.runs.map((r) => (
                        <li key={r.id}>
                          <div>
                            <strong>
                              {r.status} · {r.jobsFound} roles collected
                            </strong>
                            <time dateTime={r.startedAt}>{date(r.startedAt)}</time>
                          </div>
                          <p>
                            {r.trigger} ·{' '}
                            {r.finishedAt ? `Finished ${date(r.finishedAt)}` : 'In progress'}
                          </p>
                          {r.error && <p className="ws-error">Source result: {r.error}</p>}
                          <p>
                            Run: <code>{r.id}</code>
                          </p>
                          {r.requestId && (
                            <p>
                              Request: <code>{r.requestId}</code>
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                  {!(tab === 'events' ? detail.events.length : detail.runs.length) && (
                    <p>No {tab === 'events' ? 'events' : 'runs'} on this page.</p>
                  )}
                  <Pager
                    offset={historyOffset}
                    total={tab === 'events' ? detail.eventTotal : detail.runTotal}
                    onChange={setHistoryOffset}
                    label="History pages"
                  />
                </>
              )}
            </section>
          )}
        </>
      )}
    </section>
  )
}
