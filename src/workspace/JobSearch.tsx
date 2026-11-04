import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bookmark,
  FileText,
  LoaderCircle,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react'
import type { Bootstrap, Job, Run, Source } from '../../shared/types'
import type { GroundedResponse } from '../../shared/matching'
import { api } from './api'
import { JobReview } from './JobReview'
import { JobAlertForm } from './JobAlerts'
import './job-search.css'
type Action = (work: () => Promise<void>, success?: string) => Promise<void>
const pageSize = 36
const tone = (value: string) =>
  ['sky', 'mint', 'butter', 'lilac'][Array.from(value).reduce((n, c) => n + c.charCodeAt(0), 0) % 4]
export function Discover({
  act,
  busy,
  discover,
  running,
  boot,
  onProfile,
}: {
  act: Action
  busy: boolean
  discover: () => void
  running: boolean
  boot: Bootstrap
  onProfile: () => void
}) {
  const [jobs, setJobs] = useState<Job[]>([]),
    [total, setTotal] = useState(0),
    [offset, setOffset] = useState(0),
    [next, setNext] = useState<number | null>(null),
    [q, setQ] = useState(''),
    [exclude, setExclude] = useState(''),
    [remote, setRemote] = useState(false),
    [saved, setSaved] = useState(false),
    [deadline, setDeadline] = useState(false),
    [source, setSource] = useState(''),
    [sources, setSources] = useState<Source[]>([]),
    [runs, setRuns] = useState<Run[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [selected, setSelected] = useState<Job | null>(null),
    [tab, setTab] = useState<'overview' | 'resume' | 'deadline'>('overview')
  const requestNumber = useRef(0),
    dialog = useRef<HTMLDialogElement>(null)
  const load = useCallback(async () => {
    const request = ++requestNumber.current
    setLoading(true)
    setError('')
    try {
      const r = await api<{ jobs: Job[]; total: number; nextOffset: number | null }>(
        `/jobs?${new URLSearchParams({ q, exclude, remote: remote ? 'true' : '', saved: saved ? 'true' : '', deadline: deadline ? 'true' : '', source, limit: String(pageSize), offset: String(offset) })}`,
      )
      if (request === requestNumber.current) {
        setJobs(r.jobs)
        setTotal(r.total)
        setNext(r.nextOffset)
      }
    } catch (e) {
      if (request === requestNumber.current) setError((e as Error).message)
    } finally {
      if (request === requestNumber.current) setLoading(false)
    }
  }, [q, exclude, remote, saved, deadline, source, offset])
  useEffect(() => {
    const timer = setTimeout(() => void load(), 220)
    return () => {
      clearTimeout(timer)
      requestNumber.current++
    }
  }, [load])
  useEffect(() => {
    void Promise.all([
      api<{ sources: Source[] }>('/sources'),
      api<{ runs: Run[] }>('/discovery/runs'),
    ])
      .then(([s, r]) => {
        setSources(s.sources)
        setRuns(r.runs)
      })
      .catch((e) => setError(e.message))
  }, [running])
  useEffect(() => {
    if (selected) dialog.current?.showModal()
  }, [selected?.id])
  const filter = (action: () => void) => {
    setOffset(0)
    action()
  }
  const open = (job: Job, view: 'overview' | 'resume' | 'deadline' = 'overview') => {
    setTab(view)
    setSelected(job)
  }
  const save = async (job: Job) => {
    await api('/applications', 'POST', { jobId: job.id, status: 'saved' })
    setJobs((old) => old.map((j) => (j.id === job.id ? { ...j, status: 'saved' } : j)))
    setSelected((old) => (old?.id === job.id ? { ...old, status: 'saved' } : old))
  }
  return (
    <div className="jh-discovery">
      <header className="jh-page-title">
        <div>
          <h1>Your next move</h1>
          <p>Relevant openings. Clear evidence. A resume ready for each one.</p>
        </div>
        <button className="ws-button ws-primary" disabled={busy || running} onClick={discover}>
          {running ? <LoaderCircle className="ws-spin" size={16} /> : <Sparkles size={16} />}{' '}
          {running ? 'Finding your matches…' : 'Find new matches'}
        </button>
      </header>
      <div className="jh-search-layout">
        <aside className="jh-search-aside">
          <SearchAssistant
            aiAvailable={!!boot.ai.available && !!boot.entitlements.canUseAi}
            provider={boot.settings.aiProvider || 'ollama'}
            onOpen={async (id) => {
              try {
                open((await api<{ job: Job }>(`/jobs/${id}`)).job)
              } catch (e) {
                setError((e as Error).message)
              }
            }}
          />
          <div className="jh-direction">
            <h3>Your search direction</h3>
            <p>{boot.profile.roles.join(' · ') || 'Choose your roles'}</p>
            <p className="ws-muted">{boot.profile.locations.join(' · ') || 'Choose locations'}</p>
            <p className="ws-muted">
              {boot.profile.experienceLevels?.join(' · ') ||
                boot.profile.experience ||
                'Any experience level'}
            </p>
            <button className="ws-text-button" onClick={onProfile}>
              Refine my direction <ArrowRight size={14} />
            </button>
          </div>
        </aside>
        <div className="jh-results">
          <div className="jh-search-tools">
            <label className="jh-main-search">
              <Search size={19} />
              <input
                aria-label="Search role, company or keyword"
                placeholder="Search your matches by title, company or skill"
                value={q}
                onChange={(e) => filter(() => setQ(e.target.value))}
              />
              {q && (
                <button aria-label="Clear search" onClick={() => filter(() => setQ(''))}>
                  <X size={16} />
                </button>
              )}
            </label>
            <div className="jh-filter-row">
              <button
                className="jh-filter"
                aria-pressed={remote}
                onClick={() => filter(() => setRemote(!remote))}
              >
                Remote
              </button>
              <button
                className="jh-filter"
                aria-pressed={saved}
                onClick={() => filter(() => setSaved(!saved))}
              >
                Tracked
              </button>
              <button
                className="jh-filter"
                aria-pressed={deadline}
                onClick={() => filter(() => setDeadline(!deadline))}
              >
                <Bell size={13} /> Has deadline
              </button>
              <select
                aria-label="Filter source"
                value={source}
                onChange={(e) => filter(() => setSource(e.target.value))}
              >
                <option value="">All sources</option>
                {sources
                  .filter((s) => s.enabled)
                  .map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
              <details className="jh-filter-more">
                <summary>
                  <SlidersHorizontal size={14} /> More
                </summary>
                <label>
                  Exclude keywords (comma separated)
                  <input
                    value={exclude}
                    placeholder="e.g. manager, clearance"
                    onChange={(e) => filter(() => setExclude(e.target.value))}
                  />
                </label>
              </details>
              {(q || exclude || remote || saved || deadline || source) && (
                <button
                  className="ws-text-button"
                  onClick={() => {
                    setQ('')
                    setExclude('')
                    setRemote(false)
                    setSaved(false)
                    setDeadline(false)
                    setSource('')
                    setOffset(0)
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
          {!boot.profile.skills.length && (
            <div className="jh-profile-nudge">
              <FileText size={20} />
              <div>
                <strong>A better match starts with your story</strong>
                <p>
                  Upload and review your resume details, then compare your versions inside any job.
                </p>
              </div>
              <button className="ws-button" onClick={onProfile}>
                Review profile <ArrowRight size={14} />
              </button>
            </div>
          )}
          <div className="jh-results-heading">
            <h2>
              {loading ? 'Updating matches…' : `${total.toLocaleString()} matching opportunities`}
            </h2>
            <span>
              {total
                ? `${offset + 1}–${Math.min(offset + jobs.length, total)} of ${total.toLocaleString()}`
                : 'Your personal results'}
            </span>
          </div>
          {error && (
            <p className="ws-banner ws-error" role="alert">
              {error}
              <button onClick={() => void load()}>Retry</button>
            </p>
          )}
          {loading ? (
            <div className="jh-job-grid" aria-label="Loading jobs">
              {Array.from({ length: 6 }, (_, i) => (
                <div className="jh-job-skeleton" key={i} />
              ))}
            </div>
          ) : !jobs.length ? (
            <div className="ws-empty">
              <Search size={26} />
              <h3>{offset ? 'No results on this page' : 'No matches for these filters yet'}</h3>
              <p>
                Refine the filters or update your direction. Discovery uses your selected roles and
                locations; a missing salary or requirement stays unknown.
              </p>
              {offset > 0 ? (
                <button className="ws-button" onClick={() => setOffset(0)}>
                  Back to first page
                </button>
              ) : (
                <button className="ws-button" disabled={busy || running} onClick={discover}>
                  Find new matches
                </button>
              )}
            </div>
          ) : (
            <div className="jh-job-grid">
              {jobs.map((job) => (
                <article className={`jh-job jh-tone-${tone(job.company)}`} key={job.id}>
                  <div className="jh-job-face">
                    <div className="jh-job-meta">
                      <span>{job.location || 'Location not supplied'}</span>
                      <span className="jh-fit-badge">
                        {job.matchScore}%<small>Profile fit</small>
                      </span>
                    </div>
                    <button className="jh-job-title" onClick={() => open(job)}>
                      {job.title}
                    </button>
                    <div className="jh-card-tags">
                      <span>{job.remote ? 'Remote' : 'Location based'}</span>
                      <span>
                        {job.salaryMin !== null
                          ? `${job.currency || ''} ${job.salaryMin.toLocaleString()}+`
                          : 'Salary unknown'}
                      </span>
                      {job.deadlineAt && (
                        <span>
                          <Bell size={11} /> {new Date(job.deadlineAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <div className="jh-card-face-actions">
                      <button
                        disabled={busy || !!job.status}
                        onClick={() =>
                          void act(
                            () => save(job),
                            'Job saved. An exact employer deadline also creates an in-app reminder.',
                          )
                        }
                      >
                        <Bookmark size={14} />
                        {job.status ? 'Tracked' : 'Save'}
                      </button>
                      <button onClick={() => open(job)}>
                        <FileText size={14} /> Details
                      </button>
                    </div>
                  </div>
                  <footer>
                    <span className="jh-company-initial" aria-hidden="true">
                      {job.company.slice(0, 2)}
                    </span>
                    <strong title={job.company}>{job.company}</strong>
                    <button className="jh-prepare-button" onClick={() => open(job, 'resume')}>
                      Resume fit <ArrowRight size={13} />
                    </button>
                  </footer>
                </article>
              ))}
            </div>
          )}
          <nav className="jh-pagination" aria-label="Result pages">
            <button
              className="ws-button"
              disabled={loading || offset === 0}
              onClick={() => setOffset(Math.max(0, offset - pageSize))}
            >
              <ArrowLeft size={15} /> Previous
            </button>
            <span>
              Page {Math.floor(offset / pageSize) + 1} of {Math.max(1, Math.ceil(total / pageSize))}{' '}
              · Every matching result is accessible
            </span>
            <button
              className="ws-button"
              disabled={loading || next === null}
              onClick={() => {
                if (next !== null) setOffset(next)
              }}
            >
              Next <ArrowRight size={15} />
            </button>
          </nav>
          <details className="jh-source-coverage">
            <summary>Where we searched & what remains unchecked</summary>
            <p>
              Employer and web searches are bounded by source availability and free allowances.
              These are collected listings before matching, not promises of qualified jobs.
            </p>
            {runs[0]?.coverage?.map((c) => (
              <section key={c.source}>
                <h3>{c.name}</h3>
                <p>
                  {c.status} · {c.jobs.toLocaleString()} collected · {c.pages} pages ·{' '}
                  {c.omittedQueries} targets omitted
                </p>
                <p className="ws-muted">{c.note}</p>
                {c.checks && (
                  <details>
                    <summary>Employer checks ({c.checks.length})</summary>
                    <ul>
                      {c.checks.map((s, i) => (
                        <li key={i}>
                          <strong>{s.name}</strong> · {s.status} · {s.jobs}
                          <p>{s.note}</p>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            ))}
          </details>
        </div>
      </div>
      <dialog
        ref={dialog}
        className="jh-detail"
        aria-labelledby="jh-detail-title"
        onClose={() => setSelected(null)}
      >
        <button
          className="jh-detail-close ws-icon-button"
          aria-label="Close job details"
          onClick={() => dialog.current?.close()}
        >
          <X />
        </button>
        {selected && (
          <>
            <div className="jh-detail-header">
              <p>
                {selected.company} · {selected.location || 'Location unknown'}
              </p>
              <h2 id="jh-detail-title">{selected.title}</h2>
              <div className="jh-detail-actions">
                <button
                  className="ws-button"
                  disabled={busy || !!selected.status}
                  onClick={() => void act(() => save(selected))}
                >
                  <Bookmark size={15} />
                  {selected.status ? 'Tracked' : 'Save job'}
                </button>
                <a
                  className="ws-button ws-primary"
                  href={selected.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Employer application <ArrowUpRight size={15} />
                </a>
              </div>
              <small>
                Opening a link does not submit an application. Review the employer’s requirements
                before applying.
              </small>
            </div>
            <nav className="jh-detail-tabs" aria-label="Job review sections">
              {(['overview', 'resume', 'deadline'] as const).map((t) => (
                <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
                  {t === 'resume' ? 'Resume fit' : t === 'deadline' ? 'Deadline' : 'Overview'}
                </button>
              ))}
            </nav>
            <div className="jh-detail-body">
              {tab === 'overview' ? (
                <>
                  <section className="jh-fit-reasons">
                    <strong>{selected.matchScore}% profile preference fit</strong>
                    <ul>
                      {selected.matchReasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                    <small>This is separate from the job-specific resume review.</small>
                  </section>
                  <h3>About this opportunity</h3>
                  <div className="jh-job-description">
                    {selected.description ||
                      'The source did not supply a job description. Check the employer page.'}
                  </div>
                  <p className="ws-muted">
                    Collected {new Date(selected.fetchedAt).toLocaleString()} ·{' '}
                    {selected.via ||
                      sources.find((s) => s.id === selected.source)?.name ||
                      'Employer source'}
                  </p>
                  <button className="ws-button" onClick={() => setTab('resume')}>
                    Compare my resumes <ArrowRight size={15} />
                  </button>
                </>
              ) : tab === 'resume' ? (
                <JobReview
                  key={selected.id}
                  job={selected}
                  aiAvailable={!!boot.ai.available && !!boot.entitlements.canUseAi}
                  provider={boot.settings.aiProvider || 'ollama'}
                />
              ) : (
                <JobAlertForm key={selected.id} job={selected} />
              )}
            </div>
          </>
        )}
      </dialog>
    </div>
  )
}
function SearchAssistant({
  aiAvailable,
  provider,
  onOpen,
}: {
  aiAvailable: boolean
  provider: string
  onOpen: (id: string) => Promise<void>
}) {
  const [question, setQuestion] = useState(''),
    [result, setResult] = useState<GroundedResponse | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [ai, setAi] = useState(false),
    [consent, setConsent] = useState(false)
  const ask = async (value: string) => {
    setQuestion(value)
    setBusy(true)
    setError('')
    try {
      setResult(
        await api<GroundedResponse>('/assistant/query', 'POST', {
          question: value,
          useAi: ai,
          consent,
        }),
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="jh-assistant">
      <div className="jh-assistant-icon">
        <Sparkles size={20} />
      </div>
      <h2>Make sense of your matches</h2>
      <p>Ask about your discovered jobs. Answers come with the passages they’re based on.</p>
      <div className="jh-prompts">
        {[
          'Which jobs mention Java and Spring?',
          'Find backend roles with relevant project work',
          'What do these roles require?',
        ].map((p) => (
          <button key={p} disabled={busy} onClick={() => void ask(p)}>
            {p}
            <ArrowRight size={13} />
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void ask(question)
        }}
      >
        <label htmlFor="job-question">Ask your job workspace</label>
        <textarea
          id="job-question"
          required
          minLength={2}
          maxLength={1000}
          value={question}
          placeholder="e.g. Which roles mention PostgreSQL?"
          onChange={(e) => setQuestion(e.target.value)}
        />
        {aiAvailable && (
          <>
            <label className="ws-check">
              <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} /> Use
              connected AI for an explanation
            </label>
            {ai && provider === 'gemini' && (
              <label className="ws-check">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />{' '}
                Send this question and retrieved job excerpts to Google for this request.
              </label>
            )}
          </>
        )}
        <button className="ws-button" disabled={busy || (ai && provider === 'gemini' && !consent)}>
          {busy ? <LoaderCircle className="ws-spin" size={15} /> : <Search size={15} />} Find
          evidence
        </button>
      </form>
      {error && (
        <p className="ws-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="jh-answer" aria-live="polite">
          <strong>
            {result.engine === 'retrieval'
              ? 'Retrieved evidence'
              : result.engine === 'minilm_retrieval'
                ? 'Semantic source matches'
                : 'Cited AI explanation'}
          </strong>
          <p>{result.answer}</p>
          {result.evidence.map((e) => (
            <details key={e.id}>
              <summary>
                {e.id} · {e.title}
              </summary>
              <blockquote>{e.quote}</blockquote>
              <button className="ws-text-button" onClick={() => void onOpen(e.jobId)}>
                Review job <ArrowRight size={13} />
              </button>
            </details>
          ))}
          <small>{result.notice}</small>
        </div>
      )}
    </section>
  )
}
