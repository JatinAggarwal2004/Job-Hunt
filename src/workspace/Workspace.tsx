import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type CSSProperties,
} from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowUpRight,
  ArrowRight,
  Bookmark,
  BriefcaseBusiness,
  CalendarClock,
  CreditCard,
  Check,
  ChevronRight,
  FileText,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  UserRound,
  X,
} from 'lucide-react'
import type {
  Application,
  ApplicationStatus,
  Bootstrap,
  Job,
  Page,
  Profile,
  Resume,
  Run,
  Settings,
  Source,
  User,
} from '../../shared/types'
import { api, ApiError } from './api'
import './workspace.css'
import { saveLocal } from '../hooks/storage'
import { workspaceColors } from './colors'
import { ActivityAdmin } from './ActivityAdmin'
import { useActivityPixel } from './activity-pixel'
import { BillingView, MonetizationPanel, smallAccessSummary } from './Billing'
import { AccountRecoveryView, VerificationNotice } from './AccountSecurity'
import { AIAdminControls } from './AISettings'
type Action = (work: () => Promise<void>, success?: string) => Promise<void>
const pages: { id: Page; label: string; icon: typeof Search }[] = [
  { id: 'overview', label: 'Your overview', icon: LayoutDashboard },
  { id: 'discover', label: 'Discover roles', icon: Search },
  { id: 'resume', label: 'Resume studio', icon: FileText },
  { id: 'applications', label: 'Applications', icon: BriefcaseBusiness },
  { id: 'profile', label: 'Search & profile', icon: UserRound },
  { id: 'settings', label: 'Settings', icon: Settings2 },
  { id: 'billing', label: 'Membership', icon: CreditCard },
  { id: 'admin', label: 'Admin studio', icon: ShieldCheck },
]
const date = (value: string | null) => (value ? new Date(value).toLocaleString() : 'Not yet')
const statusNames: Record<ApplicationStatus, string> = {
  saved: 'Saved',
  preparing: 'Preparing',
  applied: 'Applied',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Closed',
}
export function Button({
  children,
  onClick,
  primary = false,
  disabled = false,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  primary?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      className={`ws-button ${primary ? 'ws-primary' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="ws-empty">
      <div className="ws-empty-icon">
        <Sparkles size={23} />
      </div>
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  )
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="ws-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}
function Auth({ onDone }: { onDone: () => void }) {
  const [register, setRegister] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const form = new FormData(e.currentTarget)
    try {
      await api(`/auth/${register ? 'register' : 'login'}`, 'POST', Object.fromEntries(form))
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="ws-auth">
      <a href="/" className="ws-logo">
        <span>jh.</span> Job-Hunter
      </a>
      <div className="ws-auth-grid">
        <div className="ws-auth-story">
          <p className="ws-eyebrow">A LITTLE DIRECTION. A LOT OF POSSIBILITY.</p>
          <h1>
            Your next chapter
            <br />
            starts <em>with you.</em>
          </h1>
          <p>
            A thoughtful space to discover opportunities, strengthen your story, and move your
            applications forward.
          </p>
          <div className="ws-auth-steps">
            01 &nbsp; Set your direction
            <br />
            02 &nbsp; Find your possibilities
            <br />
            03 &nbsp; Make your next move
          </div>
        </div>
        <form className="ws-panel ws-auth-form" onSubmit={submit}>
          <p className="ws-eyebrow">YOUR PERSONAL WORKSPACE</p>
          <h2>{register ? 'Make room for what’s next.' : 'Welcome back.'}</h2>
          {register && (
            <Field label="Your name">
              <input name="name" autoComplete="name" required maxLength={100} />
            </Field>
          )}
          <Field label="Email address">
            <input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Password" hint={register ? 'Use at least 10 characters.' : ''}>
            <input
              name="password"
              type="password"
              autoComplete={register ? 'new-password' : 'current-password'}
              minLength={register ? 10 : undefined}
              required
            />
          </Field>
          {error && (
            <p role="alert" className="ws-error">
              {error}
            </p>
          )}
          <Button primary type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="ws-spin" size={16} /> : null}
            {register ? 'Create workspace' : 'Sign in'}
            <ArrowRight size={16} />
          </Button>
          <button
            type="button"
            className="ws-text-button"
            onClick={() => {
              setRegister(!register)
              setError('')
            }}
          >
            {register ? 'Already have an account? Sign in' : 'New here? Create an account'}
          </button>
          <a className="ws-text-button" href="/app?recovery=1">
            Forgot your password?
          </a>
          <small>
            Your profile, documents and application history belong to your account in this
            workspace. Account actions and run outcomes are recorded for administration.
          </small>
        </form>
      </div>
    </main>
  )
}
export default function Workspace() {
  const [boot, setBoot] = useState<Bootstrap | null>(null),
    [auth, setAuth] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState<Page>('overview'),
    [menu, setMenu] = useState(false),
    [running, setRunning] = useState(false),
    [revision, setRevision] = useState(0),
    [light, setLight] = useState(document.documentElement.dataset.theme === 'light')
  useActivityPixel(
    boot?.user.id,
    page,
    Boolean(boot?.activity?.enabled && !auth && !boot?.entitlements.blocked),
  )
  const reduced = useReducedMotion()
  const refresh = useCallback(async () => {
    try {
      const result = await api<Bootstrap>('/bootstrap')
      setBoot(result)
      setAuth(false)
      setRunning(result.overview.lastRun?.status === 'running')
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setAuth(true)
      else setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])
  const verificationStarted = useRef(false)
  useEffect(() => {
    const query = new URLSearchParams(location.search),
      token = query.get('verify')
    if (token) {
      if (verificationStarted.current) return
      verificationStarted.current = true
      void api<{ message: string }>('/auth/verify', 'POST', { token })
        .then((r) => setNotice(r.message))
        .catch((e) => setError(e.message))
        .finally(() => {
          history.replaceState({}, '', location.pathname)
          void refresh()
        })
    } else void refresh()
  }, [refresh])
  useEffect(() => {
    if (!boot || auth) return
    const timer = setInterval(() => void refresh(), 30000)
    return () => clearInterval(timer)
  }, [Boolean(boot), auth, refresh])
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      void api<{ runs: Run[] }>('/discovery/runs')
        .then(({ runs }) => {
          if (!runs.some((r) => r.status === 'running')) {
            setRunning(false)
            setRevision((v) => v + 1)
            void refresh()
            setNotice('Discovery finished. Review your new opportunities and source coverage.')
          }
        })
        .catch((e) => {
          setError(e.message)
          setRunning(false)
        })
    }, 2500)
    return () => clearInterval(timer)
  }, [running, refresh])
  const act: Action = async (work, success) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await work()
      if (success) setNotice(success)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setAuth(true)
      if (e instanceof ApiError && e.code === 'SUBSCRIPTION_REQUIRED') setPage('billing')
      if (e instanceof ApiError && e.code === 'ACCOUNT_BLOCKED') void refresh()
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const go = (p: Page) => {
    setPage(p)
    if (p === 'overview') void refresh()
    setMenu(false)
    setError('')
    setNotice('')
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  const discover = () =>
    void act(async () => {
      const { run } = await api<{ run: Run }>('/discovery/run', 'POST')
      setRunning(run.status === 'running')
      await refresh()
      setRevision((v) => v + 1)
    }, 'Discovery started. We’re checking your configured sources.')
  const recoveryQuery = new URLSearchParams(location.search)
  if (recoveryQuery.has('reset') || recoveryQuery.has('recovery'))
    return (
      <div className="workspace">
        <AccountRecoveryView token={recoveryQuery.get('reset') || undefined} />
      </div>
    )
  if (loading)
    return (
      <div className="workspace ws-loading" role="status">
        <LoaderCircle className="ws-spin" /> Opening your workspace…
      </div>
    )
  if (auth)
    return (
      <div className="workspace">
        <Auth
          onDone={() => {
            setPage('overview')
            void refresh()
          }}
        />
      </div>
    )
  if (!boot)
    return (
      <div className="workspace ws-loading">
        <p role="alert">{error || 'Unable to connect.'}</p>
        <Button onClick={() => void refresh()}>Try again</Button>
      </div>
    )
  if (boot.entitlements?.blocked)
    return (
      <div className="workspace">
        <main className="ws-main">
          <h1>Account access is restricted.</h1>
          <p>{boot.entitlements.blockReason || 'Contact support for help with this account.'}</p>
          <p>Your billing cancellation controls remain available below.</p>
          <Button
            onClick={() =>
              void act(async () => {
                await api('/auth/logout', 'POST')
                setAuth(true)
                setBoot(null)
              })
            }
          >
            Sign out
          </Button>
          <BillingView act={act} busy={busy} onChanged={refresh} />
        </main>
      </div>
    )
  return (
    <div
      className="workspace"
      style={workspaceColors(boot.settings.accentColor, light) as CSSProperties}
    >
      <a href="#workspace-main" className="skip-link">
        Skip to workspace
      </a>
      <aside className={`ws-sidebar ${menu ? 'is-open' : ''}`}>
        <a href="/" className="ws-logo">
          <span>jh.</span>
          {boot.settings.brandName || 'Job-Hunter'}
        </a>
        <p className="ws-nav-label">YOUR NEXT CHAPTER</p>
        <nav aria-label="Workspace">
          {pages
            .filter((p) => p.id !== 'admin' || boot.user.role === 'admin')
            .map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                aria-current={page === id ? 'page' : undefined}
                onClick={() => go(id)}
              >
                <Icon size={19} />
                {label}
                {id === page && <ChevronRight size={16} />}
              </button>
            ))}
        </nav>
        <div className="ws-sidebar-note">
          <span className="ws-small-dot" />
          <strong>
            {boot.ai.available ? 'Local AI connected' : 'Thoughtful, transparent tools'}
          </strong>
          <p>
            {boot.ai.available
              ? boot.ai.model
              : 'Resume scoring works without AI. Connect an approved model for optional writing suggestions.'}
          </p>
        </div>
        <div className="ws-account">
          <span className="ws-avatar">{boot.user.name.slice(0, 1)}</span>
          <div>
            <strong>{boot.user.name}</strong>
            <small>
              {boot.user.role === 'admin' ? 'Workspace administrator' : 'Your personal workspace'}
            </small>
          </div>
          <button
            aria-label="Sign out"
            onClick={() =>
              void act(async () => {
                await api('/auth/logout', 'POST')
                setAuth(true)
                setBoot(null)
              })
            }
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      {menu && (
        <button
          className="ws-menu-shade"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="ws-body">
        <header className="ws-topbar">
          <button
            className="ws-mobile-menu"
            aria-label="Toggle navigation"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <div className="ws-breadcrumb">
            Workspace <ChevronRight size={14} />
            <span>{pages.find((p) => p.id === page)?.label}</span>
          </div>
          <div className="ws-top-actions">
            <span className="ws-local-label">
              <span className="ws-small-dot" /> Your search, your pace
            </span>
            <button
              aria-label={light ? 'Switch to dark theme' : 'Switch to light theme'}
              className="ws-icon-button"
              onClick={() => {
                document.documentElement.dataset.theme = light ? 'dark' : 'light'
                saveLocal('jh-theme', light ? 'dark' : 'light')
                setLight(!light)
              }}
            >
              {light ? <Moon size={19} /> : <Sun size={19} />}
            </button>
          </div>
        </header>
        <main id="workspace-main" className="ws-main">
          <VerificationNotice
            verified={Boolean(boot.user.emailVerified)}
            required={Boolean(boot.emailVerificationRequired)}
            act={act}
            onChanged={refresh}
          />
          <div className="ws-plan-strip">
            <span>{boot.entitlements ? smallAccessSummary(boot.entitlements) : 'Membership'}</span>
            <span>
              {boot.entitlements?.access === 'free'
                ? `${boot.entitlements.freeRunsRemaining} / 5 lifetime discovery scans left`
                : 'All features unlocked'}
            </span>
            <button onClick={() => go('billing')}>
              Manage membership <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="ws-feedback" aria-live="polite">
            {error && (
              <div className="ws-banner ws-error" role="alert">
                {error}
                <button aria-label="Dismiss error" onClick={() => setError('')}>
                  <X size={16} />
                </button>
              </div>
            )}
            {notice && (
              <div className="ws-banner">
                <Check size={16} />
                {notice}
                <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
                  <X size={16} />
                </button>
              </div>
            )}
          </div>
          <motion.div
            key={page}
            initial={{ opacity: 1, y: reduced ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            {page === 'overview' && (
              <OverviewView boot={boot} go={go} discover={discover} busy={busy || running} />
            )}
            {page === 'discover' && (
              <Discover
                key={revision}
                act={act}
                busy={busy}
                discover={discover}
                running={running}
              />
            )}
            {page === 'resume' && (
              <ResumeStudio
                act={act}
                busy={busy}
                ai={boot.ai}
                premium={Boolean(boot.entitlements?.canUseAi)}
                provider={boot.settings.aiProvider || 'ollama'}
              />
            )}
            {page === 'applications' && <Applications act={act} busy={busy} />}
            {page === 'profile' && (
              <ProfileView
                profile={boot.profile}
                act={act}
                busy={busy}
                onSaved={async () => {
                  await refresh()
                }}
              />
            )}
            {page === 'settings' && <SettingsView boot={boot} act={act} busy={busy} />}
            {page === 'billing' && <BillingView act={act} busy={busy} onChanged={refresh} />}
            {page === 'admin' && boot.user.role === 'admin' && (
              <>
                <Admin act={act} busy={busy} refresh={refresh} />
                <MonetizationPanel act={act} busy={busy} onChanged={refresh} />
                <ActivityAdmin act={act} busy={busy} onChanged={refresh} />
              </>
            )}
          </motion.div>
          <footer className="ws-footer">
            Built for your next chapter.
            <span>Coverage is limited to configured sources. You stay in control.</span>
          </footer>
        </main>
      </div>
    </div>
  )
}
function Heading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string
  title: string
  description?: string
  children?: ReactNode
}) {
  return (
    <div className="ws-page-heading">
      <div>
        <p className="ws-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  )
}
function OverviewView({
  boot,
  go,
  discover,
  busy,
}: {
  boot: Bootstrap
  go: (p: Page) => void
  discover: () => void
  busy: boolean
}) {
  const o = boot.overview
  return (
    <>
      <Heading
        eyebrow="A NEW POSSIBILITY STARTS HERE"
        title={`Let’s find your next chapter, ${boot.user.name.split(' ')[0]}.`}
        description="A little intention today. A meaningful next step tomorrow."
      />
      <div className="ws-overview-hero">
        <div>
          <span className="ws-pill">YOUR SEARCH, IN MOTION</span>
          <h2>
            Good work starts
            <br />
            with the <em>right fit.</em>
          </h2>
          <p>
            {boot.profile.roles.length
              ? `Looking for ${boot.profile.roles.join(', ')}. Your preferences help rank every opportunity.`
              : 'Tell us the roles you’re interested in. We’ll help bring the possibilities into focus.'}
          </p>
          <Button
            primary
            onClick={boot.profile.roles.length ? discover : () => go('profile')}
            disabled={busy}
          >
            {busy ? <LoaderCircle className="ws-spin" size={17} /> : <Search size={17} />}{' '}
            {boot.profile.roles.length ? 'Find new opportunities' : 'Set your direction'}
            <ArrowRight size={17} />
          </Button>
        </div>
        <div className="ws-orbit-art" aria-hidden="true">
          <span />
          <span />
          <span />
          <div>
            jh<span>.</span>
          </div>
          <i>YOUR NEXT MOVE ↗</i>
        </div>
      </div>
      <div className="ws-stat-grid">
        {[
          { n: o.jobs, l: 'Discovered roles', p: 'discover' },
          { n: o.saved, l: 'Saved opportunities', p: 'applications' },
          { n: o.applied, l: 'Applications sent', p: 'applications' },
          { n: o.interviews, l: 'Interview conversations', p: 'applications' },
        ].map((item) => (
          <button className="ws-panel ws-stat" key={item.l} onClick={() => go(item.p as Page)}>
            <span>
              {item.l}
              <ArrowUpRight size={16} />
            </span>
            <strong>{item.n.toLocaleString()}</strong>
            <small>
              {item.p === 'discover' ? 'Across connected sources' : 'From your application tracker'}
            </small>
          </button>
        ))}
      </div>
      <div className="ws-two-col">
        <section className="ws-panel">
          <div className="ws-section-top">
            <h2>Your next small steps</h2>
            <span className="ws-muted">One thing at a time</span>
          </div>
          {[
            {
              n: '01',
              title: 'Make the search yours',
              copy: 'Roles, locations, salary, and a rhythm that fits.',
              page: 'profile',
            },
            {
              n: '02',
              title: 'Give your story a little clarity',
              copy: 'An explained resume review. Every edit is your call.',
              page: 'resume',
            },
            {
              n: '03',
              title: 'Turn possibilities into progress',
              copy: 'Save an opportunity and prepare your next application.',
              page: 'discover',
            },
          ].map((item) => (
            <button className="ws-step" key={item.n} onClick={() => go(item.page as Page)}>
              <span>{item.n}</span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.copy}</p>
              </div>
              <ArrowUpRight size={19} />
            </button>
          ))}
        </section>
        <section className="ws-panel ws-schedule-card">
          <CalendarClock size={27} />
          <p className="ws-eyebrow">YOUR SEARCH RHYTHM</p>
          <h2>
            {boot.profile.scheduleEnabled
              ? 'A daily moment for possibility.'
              : 'A search that moves at your pace.'}
          </h2>
          <p>
            {boot.profile.scheduleEnabled
              ? `Daily at ${String(boot.profile.scheduleHour).padStart(2, '0')}:00 in ${boot.profile.timezone}. The server must be running.`
              : 'Run discovery whenever you’re ready, or set up a daily search.'}
          </p>
          <dl>
            <div>
              <dt>Last discovery</dt>
              <dd>{date(o.lastRun?.startedAt || null)}</dd>
            </div>
            <div>
              <dt>Next scheduled run</dt>
              <dd>{date(o.nextRun)}</dd>
            </div>
          </dl>
          <Button onClick={() => go('profile')}>
            Adjust your schedule <ArrowRight size={16} />
          </Button>
        </section>
      </div>
    </>
  )
}
function Discover({
  act,
  busy,
  discover,
  running,
}: {
  act: Action
  busy: boolean
  discover: () => void
  running: boolean
}) {
  const [jobs, setJobs] = useState<Job[]>([]),
    [total, setTotal] = useState(0),
    [q, setQ] = useState(''),
    [remote, setRemote] = useState(false),
    [source, setSource] = useState(''),
    [sources, setSources] = useState<Source[]>([]),
    [coverageRuns, setCoverageRuns] = useState<Run[]>([]),
    [webStatus, setWebStatus] = useState<{
      configured: boolean
      monthlyCap: number
      maxRequestsPerRun: number
      maxPagesPerQuery: number
    } | null>(null),
    [loading, setLoading] = useState(true),
    [selected, setSelected] = useState<Job | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<{ jobs: Job[]; total: number }>(
        `/jobs?${new URLSearchParams({ q, remote: remote ? 'true' : '', source, limit: '100' })}`,
      )
      setJobs(data.jobs)
      setTotal(data.total)
    } finally {
      setLoading(false)
    }
  }, [q, remote, source])
  useEffect(() => {
    const id = setTimeout(() => void act(load), 250)
    return () => clearTimeout(id)
  }, [load])
  useEffect(() => {
    void act(async () => {
      const [data, history] = await Promise.all([
        api<{ sources: Source[]; webDiscovery: typeof webStatus }>('/sources'),
        api<{ runs: Run[] }>('/discovery/runs'),
      ])
      setSources(data.sources)
      setWebStatus(data.webDiscovery)
      setCoverageRuns(history.runs)
    })
  }, [running])
  useEffect(() => {
    if (selected) dialog.current?.showModal()
  }, [selected])
  async function save(job: Job) {
    await api('/applications', 'POST', { jobId: job.id, status: 'saved' })
    await load()
    setSelected((current) => (current?.id === job.id ? { ...current, status: 'saved' } : current))
  }
  return (
    <>
      <Heading
        eyebrow="OPEN DOORS. REAL POSSIBILITIES."
        title="Find work that fits you."
        description="Search your connected feeds, company boards and configured web index, ranked against your preferences."
      >
        <Button primary onClick={discover} disabled={busy || running}>
          {running ? <LoaderCircle size={16} className="ws-spin" /> : <Sparkles size={16} />}{' '}
          {running ? 'Searching sources…' : 'Discover new roles'}
        </Button>
      </Heading>
      <form className="ws-searchbar" onSubmit={(e) => e.preventDefault()}>
        <label>
          <Search size={20} />
          <input
            aria-label="Search role, company or keyword"
            placeholder="Role, company, or a little inspiration…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <label className="ws-check">
          <input type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} />{' '}
          Remote only
        </label>
      </form>
      <details className="ws-coverage">
        <summary>Connected sources &amp; search coverage</summary>
        <p>
          {webStatus?.configured
            ? `Web index connected: up to ${webStatus.maxRequestsPerRun} searches per run, ${webStatus.maxPagesPerQuery} pages per role/location query, and ${webStatus.monthlyCap} shared searches per month.`
            : 'Wider web search is not connected yet. Currently only enabled feeds and company boards are checked. Ask your administrator to connect the free web-search provider.'}{' '}
          No index covers every job. Remote does not guarantee eligibility in your country. Missing
          salary and company size stay unknown.
        </p>
        {coverageRuns[0]?.coverage?.map((item) => (
          <div key={item.source}>
            <strong>Latest run · {item.name}</strong>
            <span>
              {item.status} · {item.pages} pages · {item.jobs} collected · {item.omittedQueries}{' '}
              queries omitted
            </span>
            {item.queries.length > 0 && (
              <ul>
                {item.queries.map((query) => (
                  <li key={query}>{query}</li>
                ))}
              </ul>
            )}
            <p>{item.note}</p>
          </div>
        ))}
        {sources.map((s) => (
          <div key={s.id}>
            <strong>{s.name}</strong>
            <span>
              {s.enabled ? 'Enabled' : 'Paused'} · {s.jobCount} roles on last check ·{' '}
              {date(s.lastRun)}
            </span>
            {s.lastError && <p className="ws-error">Last check failed: {s.lastError}</p>}
          </div>
        ))}
      </details>
      <div className="ws-list-heading">
        <span>
          {loading
            ? 'Refreshing opportunities…'
            : `${total} opportunities${total > 100 ? ' · showing first 100' : ''}`}
        </span>
        <span>Ranked by preference fit</span>
      </div>
      {!loading && !jobs.length ? (
        <Empty title="Your next opportunity is out there.">
          <p>Run discovery to collect openings, or broaden your search filters.</p>
          <p>
            Administrators can add company boards in Admin studio. Coverage includes only connected
            sources.
          </p>
          <Button onClick={discover} disabled={busy || running}>
            Search connected sources <ArrowRight size={16} />
          </Button>
        </Empty>
      ) : (
        <div className="ws-job-grid">
          {jobs.map((job) => (
            <article key={job.id} className="ws-panel ws-job-card">
              <div className="ws-job-top">
                <span className="ws-company-avatar">{job.company.slice(0, 2)}</span>
                <div>
                  <strong>{job.company}</strong>
                  <small>
                    {job.via ||
                      sources.find((s) => s.id === job.source)?.name ||
                      'Previously connected source'}
                  </small>
                </div>
                <button
                  aria-label={job.status ? `${job.title} is tracked` : `Save ${job.title}`}
                  className={`ws-icon-button ${job.status ? 'is-saved' : ''}`}
                  disabled={busy || !!job.status}
                  onClick={() =>
                    void act(() => save(job), 'Opportunity saved to your applications.')
                  }
                >
                  <Bookmark size={19} fill={job.status ? 'currentColor' : 'none'} />
                </button>
              </div>
              <button className="ws-job-title" onClick={() => setSelected(job)}>
                {job.title}
              </button>
              <p className="ws-muted">{job.location || 'Location not specified'}</p>
              <div className="ws-tags">
                <span>{job.remote ? 'Remote' : 'Location based'}</span>
                <span>
                  {job.salaryMin !== null
                    ? `${job.currency || ''} ${job.salaryMin.toLocaleString()}${job.salaryMax ? ` – ${job.salaryMax.toLocaleString()}` : ''}`
                    : 'Salary not listed'}
                </span>
              </div>
              <div className="ws-job-bottom">
                <span className="ws-match">{job.matchScore}% preference fit</span>
                <button onClick={() => setSelected(job)}>
                  View role <ArrowUpRight size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <dialog
        ref={dialog}
        className="ws-dialog"
        aria-label="Job details"
        onClose={() => setSelected(null)}
      >
        {selected && (
          <>
            <button
              className="ws-dialog-close ws-icon-button"
              aria-label="Close job details"
              onClick={() => dialog.current?.close()}
            >
              <X />
            </button>
            <p className="ws-eyebrow">
              {selected.company} ·{' '}
              {sources.find((s) => s.id === selected.source)?.name || 'Previously connected source'}
            </p>
            <h2>{selected.title}</h2>
            <p className="ws-muted">
              {selected.location} · {selected.remote ? 'Remote' : 'Location based'}
            </p>
            <div className="ws-fit-box">
              <strong>{selected.matchScore}% preference fit</strong>
              <ul>
                {selected.matchReasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
              <small>This is a preference match, not a hiring prediction.</small>
            </div>
            {selected.via && (
              <p className="ws-muted">
                Indexed via {selected.via}. Confirm the opening and eligibility on the application
                site.
              </p>
            )}
            {Boolean(selected.applyLinks?.length) && (
              <div className="ws-tags">
                {selected.applyLinks!.map((link) => (
                  <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">
                    Apply via {link.name} <ArrowUpRight size={14} />
                  </a>
                ))}
              </div>
            )}
            <div className="ws-description">{selected.description}</div>
            <p className="ws-muted">
              Posted: {selected.postedAt ? date(selected.postedAt) : 'Not listed'} · Collected:{' '}
              {date(selected.fetchedAt)}
            </p>
            <div className="ws-row">
              <Button
                onClick={() => void act(() => save(selected), 'Saved to your application tracker.')}
                disabled={busy || !!selected.status}
              >
                {selected.status ? 'Already tracked' : 'Save opportunity'}
              </Button>
              <a
                className="ws-button ws-primary"
                href={selected.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open original application <ArrowUpRight size={16} />
              </a>
            </div>
            <small className="ws-muted">
              Opening the application does not submit it. Mark it as applied in your tracker after
              you submit.
            </small>
          </>
        )}
      </dialog>
    </>
  )
}

function ResumeStudio({
  act,
  busy,
  ai,
  premium,
  provider,
}: {
  act: Action
  busy: boolean
  ai: Bootstrap['ai']
  premium: boolean
  provider: 'ollama' | 'gemini'
}) {
  const [resumes, setResumes] = useState<Resume[]>([]),
    [selected, setSelected] = useState(''),
    [text, setText] = useState(''),
    [name, setName] = useState('My resume'),
    [jobId, setJobId] = useState(''),
    [jobs, setJobs] = useState<Job[]>([]),
    [creating, setCreating] = useState(false)
  const [aiConsent, setAiConsent] = useState(false)
  const current = resumes.find((r) => r.id === selected)
  const file = useRef<HTMLInputElement>(null)
  const load = useCallback(async () => {
    const r = await api<{ resumes: Resume[] }>('/resumes')
    setResumes(r.resumes)
    return r.resumes
  }, [])
  useEffect(() => {
    void act(async () => {
      const r = await load()
      if (r[0]) {
        setSelected(r[0].id)
        setText(r[0].text)
        setName(r[0].filename)
      }
      setJobs((await api<{ jobs: Job[] }>('/jobs?limit=500')).jobs)
    })
  }, [])
  function choose(r: Resume) {
    setSelected(r.id)
    setText(r.text)
    setName(r.filename)
    setCreating(false)
  }
  function update(r: Resume) {
    setResumes((old) => [r, ...old.filter((x) => x.id !== r.id)])
    choose(r)
  }
  async function upload(f: File) {
    const data = new FormData()
    data.set('file', f)
    update((await api<{ resume: Resume }>('/resumes/upload', 'POST', data)).resume)
  }
  async function save() {
    const r = await api<{ resume: Resume }>(
      current && !creating ? `/resumes/${current.id}` : '/resumes/text',
      current && !creating ? 'PATCH' : 'POST',
      current && !creating ? { text } : { text, filename: name || 'Resume.txt' },
    )
    update(r.resume)
  }
  async function suggestion(id: string, status: 'accepted' | 'rejected' | 'pending') {
    if (!current) return
    update(
      (
        await api<{ resume: Resume }>(`/resumes/${current.id}/suggestions/${id}`, 'PATCH', {
          status,
        })
      ).resume,
    )
  }
  function download() {
    if (!current) return
    const url = URL.createObjectURL(new Blob([current.text], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = current.filename.replace(/\.[^.]+$/, '') + '.txt'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <>
      <Heading
        eyebrow="YOUR EXPERIENCE, CLEARER"
        title="A stronger story. Still yours."
        description="Upload your resume, explore explained feedback, and choose every change yourself."
      >
        <Button
          onClick={() => {
            setCreating(true)
            setSelected('')
            setText('')
            setName('My resume.txt')
          }}
        >
          <FileText size={16} /> New text version
        </Button>
      </Heading>
      <div className="ws-ai-note">
        <Sparkles size={18} />
        <span>
          {ai.message}{' '}
          {ai.available
            ? 'Optional local writing suggestions are available.'
            : 'You can use all document checks without connecting a language model.'}
        </span>
      </div>
      <div className="ws-two-col ws-resume-layout">
        <section className="ws-panel">
          <div className="ws-section-top">
            <h2>Your resume library</h2>
            <span className="ws-muted">{resumes.length} / 20 versions</span>
          </div>
          <button className="ws-upload" disabled={busy} onClick={() => file.current?.click()}>
            <FileText size={30} />
            <strong>Bring your experience along.</strong>
            <span>Choose a PDF, DOCX or TXT file · up to 5 MB</span>
          </button>
          <input
            ref={file}
            type="file"
            accept=".pdf,.docx,.txt"
            aria-label="Upload resume"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void act(() => upload(f), 'Resume text extracted. Review it before analysis.')
              e.target.value = ''
            }}
          />
          <div className="ws-version-list">
            {resumes.map((r) => (
              <button
                className={selected === r.id ? 'selected' : ''}
                key={r.id}
                onClick={() => choose(r)}
              >
                <FileText size={17} />
                <span>
                  <strong>{r.filename}</strong>
                  <small>{date(r.createdAt)}</small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
          {!current && !creating ? (
            <p className="ws-muted">
              Your documents stay in this local installation. Scanned PDFs need text pasted
              manually.
            </p>
          ) : (
            <>
              <Field label="Version name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={200}
                  disabled={!!current}
                />
              </Field>
              <Field
                label="Resume text"
                hint="Check extracted text for missing sections. Saving edits resets the analysis."
              >
                <textarea
                  rows={15}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste your resume text here…"
                />
              </Field>
              <div className="ws-row">
                <Button
                  primary
                  onClick={() => void act(save, 'Resume saved.')}
                  disabled={busy || text.trim().length < 20}
                >
                  Save text
                </Button>
                {current && (
                  <>
                    <Button onClick={download}>Export text</Button>
                    <Button
                      onClick={() =>
                        void act(async () => {
                          await api(`/resumes/${current.id}`, 'DELETE')
                          setResumes(resumes.filter((r) => r.id !== current.id))
                          setSelected('')
                          setText('')
                        }, 'Resume deleted.')
                      }
                      disabled={busy}
                    >
                      Delete version
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </section>
        <section className="ws-panel ws-analysis">
          <div className="ws-section-top">
            <h2>A little more clarity</h2>
            <span className="ws-pill">YOUR CALL, ALWAYS</span>
          </div>
          <Field label="Compare with an opportunity">
            <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">General document review</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title} · {j.company}
                </option>
              ))}
            </select>
          </Field>
          <Button
            primary
            disabled={busy || !current || current.text !== text}
            onClick={() =>
              void act(
                async () =>
                  update(
                    (
                      await api<{ resume: Resume }>(
                        `/resumes/${current!.id}/analyze`,
                        'POST',
                        jobId ? { jobId } : {},
                      )
                    ).resume,
                  ),
                'Review ready. Read the explanation behind each suggestion.',
              )
            }
          >
            <Sparkles size={16} />
            {busy ? 'Working…' : 'Review this resume'}
          </Button>
          <div className="ws-ai-actions">
            <p className="ws-muted">
              Document checks are included. Pro adds AI wording drafts, subject to the configured
              daily usage limit.
            </p>
            {provider === 'gemini' && (
              <label className="ws-check">
                <input
                  type="checkbox"
                  checked={aiConsent}
                  onChange={(e) => setAiConsent(e.target.checked)}
                />
                I agree to send this resume text to Google Gemini for writing suggestions. Provider
                data-use terms apply.
              </label>
            )}
            <Button
              disabled={
                busy ||
                !current ||
                current.text !== text ||
                !premium ||
                !ai.available ||
                (provider === 'gemini' && !aiConsent)
              }
              onClick={() =>
                void act(
                  async () =>
                    update(
                      (
                        await api<{ resume: Resume }>(`/resumes/${current!.id}/analyze`, 'POST', {
                          ...(jobId ? { jobId } : {}),
                          useAi: true,
                          consent: aiConsent,
                        })
                      ).resume,
                    ),
                  'AI drafts ready. Check every fact before accepting.',
                )
              }
            >
              <Sparkles size={16} />
              {premium ? 'Draft AI improvements' : 'AI writing · Pro'}
            </Button>
          </div>
          {current?.analysis ? (
            <>
              <div className="ws-score">
                <div>
                  <strong>
                    {current.analysis.score}
                    <small>/100</small>
                  </strong>
                  <span>{current.analysis.label}</span>
                </div>
                <p>
                  Writing checklist
                  <br />
                  <span>
                    {current.analysis.engine !== 'rules'
                      ? `With ${current.analysis.engine === 'gemini' ? 'Gemini' : 'local AI'} suggestions`
                      : 'Transparent rules'}
                  </span>
                </p>
              </div>
              <p className="ws-score-notice">{current.analysis.notice}</p>
              <div className="ws-dimensions">
                {current.analysis.dimensions.map((d) => (
                  <div key={d.name}>
                    <div>
                      <strong>{d.name}</strong>
                      <span>
                        {d.score}/{d.max}
                      </span>
                    </div>
                    <meter min={0} max={d.max} value={d.score} aria-label={d.name} />
                    <p>{d.reason}</p>
                  </div>
                ))}
              </div>
              {current.analysis.missingSkills.length > 0 && (
                <p className="ws-muted">
                  Evidence to consider, only if true: {current.analysis.missingSkills.join(', ')}.
                </p>
              )}
              <h3>Suggestions to consider</h3>
              {!current.analysis.suggestions.length && (
                <p className="ws-muted">
                  No specific text changes suggested by these checks. Review the dimensions above.
                </p>
              )}
              {current.analysis.suggestions.map((s) => (
                <article className="ws-suggestion" key={s.id}>
                  <div>
                    <span className="ws-pill">{s.category}</span>
                    <span className="ws-muted">{s.status}</span>
                  </div>
                  <h4>{s.title}</h4>
                  <p>{s.detail}</p>
                  {s.before && (
                    <>
                      <div className="ws-before">
                        <small>Current wording</small>
                        <p>{s.before}</p>
                      </div>
                      <div className="ws-after">
                        <small>Suggested wording</small>
                        <p>{s.after}</p>
                      </div>
                    </>
                  )}
                  <div className="ws-row">
                    {s.status === 'pending' ? (
                      <>
                        <Button
                          primary
                          disabled={busy}
                          onClick={() =>
                            void act(
                              () => suggestion(s.id, 'accepted'),
                              s.before
                                ? 'Suggestion applied. You can undo it.'
                                : 'Suggestion noted; edit your resume manually if relevant.',
                            )
                          }
                        >
                          {s.before ? 'Accept edit' : 'Mark reviewed'}
                        </Button>
                        <Button
                          disabled={busy}
                          onClick={() =>
                            void act(() => suggestion(s.id, 'rejected'), 'Suggestion dismissed.')
                          }
                        >
                          Dismiss
                        </Button>
                      </>
                    ) : (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void act(() => suggestion(s.id, 'pending'), 'Suggestion restored.')
                        }
                      >
                        Undo decision
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </>
          ) : (
            <Empty title="Good feedback starts with your story.">
              <p>Select or upload a resume, save any edits, then run a review.</p>
              <p>
                Your score explains document checks; it does not predict an interview or an ATS
                decision.
              </p>
            </Empty>
          )}
        </section>
      </div>
    </>
  )
}
function Applications({ act, busy }: { act: Action; busy: boolean }) {
  const [items, setItems] = useState<Application[]>([]),
    [filter, setFilter] = useState('all'),
    [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    try {
      setItems((await api<{ applications: Application[] }>('/applications')).applications)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void act(load)
  }, [])
  const shown = items.filter((a) => filter === 'all' || a.status === filter)
  async function change(id: string, status: ApplicationStatus) {
    await api(`/applications/${id}`, 'PATCH', { status })
    await load()
  }
  return (
    <>
      <Heading
        eyebrow="POSSIBILITY INTO PROGRESS"
        title="Every next step, in one place."
        description="Keep your notes close, prepare deliberately, and track what happens next."
      />
      <div className="ws-stage-tabs" role="group" aria-label="Filter application stage">
        {['all', ...Object.keys(statusNames)].map((s) => (
          <button key={s} aria-pressed={filter === s} onClick={() => setFilter(s)}>
            {s === 'all' ? 'All opportunities' : statusNames[s as ApplicationStatus]}
            <span>{s === 'all' ? items.length : items.filter((a) => a.status === s).length}</span>
          </button>
        ))}
      </div>
      <p className="ws-muted">
        Opening an employer page does not submit an application. Choose Applied after you have
        submitted it yourself.
      </p>
      {loading ? (
        <p role="status">Loading your applications…</p>
      ) : !shown.length ? (
        <Empty title="Room for your next opportunity.">
          <p>Save a role in Discover to start tracking it here.</p>
        </Empty>
      ) : (
        <div className="ws-application-list">
          {shown.map((item) => (
            <ApplicationCard
              key={item.id}
              item={item}
              busy={busy}
              onStatus={(status) =>
                void act(() => change(item.id, status), 'Application stage updated.')
              }
              onNotes={(notes) =>
                void act(async () => {
                  await api(`/applications/${item.id}`, 'PATCH', { notes })
                  await load()
                }, 'Notes saved.')
              }
              onDelete={() =>
                void act(async () => {
                  await api(`/applications/${item.id}`, 'DELETE')
                  await load()
                }, 'Opportunity removed from your tracker.')
              }
            />
          ))}
        </div>
      )}
    </>
  )
}
function ApplicationCard({
  item,
  busy,
  onStatus,
  onNotes,
  onDelete,
}: {
  item: Application
  busy: boolean
  onStatus: (s: ApplicationStatus) => void
  onNotes: (s: string) => void
  onDelete: () => void
}) {
  const [notes, setNotes] = useState(item.notes)
  return (
    <article className="ws-panel ws-application-card">
      <div className="ws-application-header">
        <div className="ws-company-avatar">{item.job.company.slice(0, 2)}</div>
        <div>
          <h2>{item.job.title}</h2>
          <p>
            {item.job.company} · {item.job.location}
          </p>
        </div>
        <label className="ws-field ws-stage-select">
          <span>Application stage</span>
          <select
            value={item.status}
            disabled={busy}
            onChange={(e) => onStatus(e.target.value as ApplicationStatus)}
          >
            {Object.entries(statusNames).map(([s, label]) => (
              <option value={s} key={s}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {item.job.available === false && (
        <p className="ws-muted">
          This role was absent from the latest source response. It may have moved outside the feed’s
          collection limit or closed. Check the employer page before applying.
        </p>
      )}
      <details>
        <summary>Application notes & preparation</summary>
        <Field label={`Notes for ${item.job.title}`}>
          <textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={10000}
            placeholder="Questions for the team, interview dates, next steps…"
          />
        </Field>
        <div className="ws-row">
          <Button disabled={busy || notes === item.notes} onClick={() => onNotes(notes)}>
            Save notes
          </Button>
          <Button disabled={busy} onClick={onDelete}>
            Remove from tracker
          </Button>
        </div>
      </details>
      <div className="ws-application-bottom">
        <span>Updated {date(item.updatedAt)}</span>
        <a className="ws-text-button" href={item.job.url} target="_blank" rel="noopener noreferrer">
          Open employer application <ArrowUpRight size={16} />
        </a>
      </div>
    </article>
  )
}
const splitList = (s: string) => [
  ...new Set(
    s
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
  ),
]
function ProfileView({
  profile,
  act,
  busy,
  onSaved,
}: {
  profile: Profile
  act: Action
  busy: boolean
  onSaved: () => Promise<void>
}) {
  const [draft, setDraft] = useState(profile),
    [roleText, setRoleText] = useState(profile.roles.join(', ')),
    [skillText, setSkillText] = useState(profile.skills.join(', ')),
    [locationText, setLocationText] = useState(profile.locations.join(', '))
  function field<K extends keyof Profile>(key: K, value: Profile[K]) {
    setDraft((old) => ({ ...old, [key]: value }))
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    void act(async () => {
      await api('/profile', 'PUT', {
        ...draft,
        roles: splitList(roleText),
        skills: splitList(skillText),
        locations: splitList(locationText),
      })
      await onSaved()
    }, 'Your direction is saved. New discoveries will use these preferences.')
  }
  return (
    <>
      <Heading
        eyebrow="A SEARCH THAT GETS YOU"
        title="Make room for your kind of work."
        description="A reusable profile, more than one interest, and a search rhythm that suits you."
      />
      <form onSubmit={submit} className="ws-profile-form">
        <section className="ws-panel">
          <div className="ws-section-top">
            <h2>Your direction</h2>
            <CompassIcon />
          </div>
          <Field
            label="Roles you’re interested in"
            hint="Separate roles with commas. Try broad role names; you can refine the results later."
          >
            <input
              value={roleText}
              onChange={(e) => setRoleText(e.target.value)}
              placeholder="Frontend Engineer, Backend Engineer, Product Designer"
              maxLength={2000}
            />
          </Field>
          <Field
            label="Skills you can demonstrate"
            hint="Used to explain matches and resume keyword coverage. Comma separated."
          >
            <input
              value={skillText}
              onChange={(e) => setSkillText(e.target.value)}
              placeholder="React, TypeScript, SQL"
              maxLength={2000}
            />
          </Field>
          <div className="ws-form-grid">
            <Field
              label="Preferred job locations"
              hint="Comma separated. Remote roles can still have country restrictions."
            >
              <input
                value={locationText}
                onChange={(e) => setLocationText(e.target.value)}
                placeholder="India, Bengaluru, Worldwide"
                maxLength={2000}
              />
            </Field>
            <Field label="Experience level">
              <select
                value={draft.experience}
                onChange={(e) => field('experience', e.target.value)}
              >
                <option value="">Any level</option>
                <option>Internship</option>
                <option>Entry level</option>
                <option>Mid level</option>
                <option>Senior</option>
                <option>Lead</option>
              </select>
            </Field>
          </div>
          <label className="ws-check">
            <input
              type="checkbox"
              checked={draft.remoteOnly}
              onChange={(e) => field('remoteOnly', e.target.checked)}
            />
            Remote roles only
          </label>
          <div className="ws-form-grid">
            <Field label="Minimum annual salary">
              <input
                type="number"
                min={0}
                max={10000000000}
                value={draft.salaryMin}
                onChange={(e) => field('salaryMin', Number(e.target.value))}
              />
            </Field>
            <Field label="Salary currency">
              <select value={draft.currency} onChange={(e) => field('currency', e.target.value)}>
                {['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>
          <label className="ws-check">
            <input
              type="checkbox"
              checked={draft.includeUnknownSalary}
              onChange={(e) => field('includeUnknownSalary', e.target.checked)}
            />
            Include roles with undisclosed salary
          </label>
          <fieldset className="ws-fieldset">
            <legend>Company sizes to explore</legend>
            <p>
              Known sizes are used when available. Most public boards do not provide headcount;
              unknown sizes remain visible and are labelled.
            </p>
            <div className="ws-company-options">
              {['1–10', '11–50', '51–200', '201–1000', '1000+'].map((size) => (
                <label className="ws-check" key={size}>
                  <input
                    type="checkbox"
                    checked={draft.companySizes.includes(size)}
                    onChange={(e) =>
                      field(
                        'companySizes',
                        e.target.checked
                          ? [...draft.companySizes, size]
                          : draft.companySizes.filter((s) => s !== size),
                      )
                    }
                  />
                  {size}
                </label>
              ))}
            </div>
          </fieldset>
        </section>
        <section className="ws-panel">
          <h2>Your reusable profile</h2>
          <div className="ws-form-grid">
            <Field label="Full name">
              <input
                required
                value={draft.name}
                maxLength={100}
                onChange={(e) => field('name', e.target.value)}
                autoComplete="name"
              />
            </Field>
            <Field label="Application email" hint="Your sign-in email is unchanged.">
              <input
                type="email"
                required
                value={draft.email}
                onChange={(e) => field('email', e.target.value)}
                autoComplete="email"
              />
            </Field>
            <Field label="Phone">
              <input
                type="tel"
                value={draft.phone}
                maxLength={40}
                onChange={(e) => field('phone', e.target.value)}
                autoComplete="tel"
              />
            </Field>
            <Field label="Current location">
              <input
                value={draft.location}
                maxLength={200}
                onChange={(e) => field('location', e.target.value)}
                autoComplete="address-level2"
              />
            </Field>
            <Field label="Portfolio / website">
              <input
                type="url"
                value={draft.website}
                onChange={(e) => field('website', e.target.value)}
                placeholder="https://"
              />
            </Field>
            <Field label="LinkedIn profile">
              <input
                type="url"
                value={draft.linkedin}
                onChange={(e) => field('linkedin', e.target.value)}
                placeholder="https://linkedin.com/in/…"
              />
            </Field>
          </div>
          <Field label="Professional summary">
            <textarea
              rows={4}
              value={draft.summary}
              maxLength={10000}
              onChange={(e) => field('summary', e.target.value)}
              placeholder="Your background, interests and the work you want to do next."
            />
          </Field>
          <p className="ws-muted">
            Use Settings to connect this profile to the optional application assistant.
          </p>
        </section>
        <section className="ws-panel">
          <div className="ws-section-top">
            <h2>A rhythm for your search</h2>
            <CalendarClock size={22} />
          </div>
          <label className="ws-check">
            <input
              type="checkbox"
              checked={draft.scheduleEnabled}
              onChange={(e) => field('scheduleEnabled', e.target.checked)}
            />
            Search connected sources daily
          </label>
          <div className="ws-form-grid">
            <Field label="Search time">
              <select
                value={draft.scheduleHour}
                onChange={(e) => field('scheduleHour', Number(e.target.value))}
              >
                {Array.from({ length: 24 }, (_, hour) => (
                  <option value={hour} key={hour}>
                    {String(hour).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Time zone">
              <input
                value={draft.timezone}
                onChange={(e) => field('timezone', e.target.value)}
                placeholder="Asia/Kolkata"
                list="timezones"
              />
              <datalist id="timezones">
                {[
                  'Asia/Kolkata',
                  'Asia/Singapore',
                  'Europe/London',
                  'Europe/Berlin',
                  'America/New_York',
                  'America/Los_Angeles',
                  'Australia/Sydney',
                  'UTC',
                ].map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
            </Field>
          </div>
          <p className="ws-muted">
            The server must remain running. If it starts after your chosen hour, it catches up once
            that day. Discovery finds roles; it never submits applications.
          </p>
        </section>
        <div className="ws-save-bar">
          <span>Your preferences shape every next step.</span>
          <Button primary type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save my direction'}
            <Check size={16} />
          </Button>
        </div>
      </form>
    </>
  )
}
function CompassIcon() {
  return <ArrowUpRight size={22} />
}
function SettingsView({ boot, act, busy }: { boot: Bootstrap; act: Action; busy: boolean }) {
  const [token, setToken] = useState('')
  return (
    <>
      <Heading
        eyebrow="MAKE YOURSELF AT HOME"
        title="Your tools. Your control."
        description="Connect your reusable profile and understand how this installation works."
      />
      <div className="ws-two-col">
        <section className="ws-panel">
          <span className="ws-feature-icon">
            <MousePointerIcon />
          </span>
          <h2>A little less form filling.</h2>
          <p className="ws-muted">
            The browser assistant fills empty contact fields from your saved profile when you ask.
            You review the answers and submit the application yourself.
          </p>
          <ol className="ws-instructions">
            <li>
              <a href="/job-hunter-extension.zip" download>
                Download the application assistant ZIP
              </a>{' '}
              and extract it.
            </li>
            <li>
              Open <code>chrome://extensions</code>, enable Developer mode, choose Load unpacked and
              select the extracted folder.
            </li>
            <li>
              Create a connection token below. Enter this site’s origin in the assistant, then paste
              the token.
            </li>
            <li>Open an application page, click the assistant and choose Fill contact fields.</li>
          </ol>
          <div className="ws-row">
            <Button
              primary
              disabled={busy}
              onClick={() =>
                void act(
                  async () =>
                    setToken((await api<{ token: string }>('/extension/token', 'POST')).token),
                  'Token created. Copy it into the assistant; this replaces any previous token.',
                )
              }
            >
              Create connection token
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await api('/extension/token', 'DELETE')
                  setToken('')
                }, 'Application assistant disconnected.')
              }
            >
              Revoke token
            </Button>
          </div>
          {token && (
            <Field
              label="Connection token"
              hint="Treat this like a password. It expires in 30 days. It is shown only now."
            >
              <input readOnly value={token} onFocus={(e) => e.target.select()} />
            </Field>
          )}
          <p className="ws-muted">
            Supported: empty name, email, phone, location, LinkedIn and website fields. Custom
            controls, embedded frames and file uploads require manual review. No demographic or
            authorization answers are filled.
          </p>
        </section>
        <section className="ws-panel">
          <span className="ws-feature-icon">
            <Sparkles size={25} />
          </span>
          <h2>Intelligence, thoughtfully.</h2>
          <p className="ws-muted">{boot.ai.message}</p>
          <dl className="ws-info-list">
            <div>
              <dt>Document scoring</dt>
              <dd>Explained writing rules</dd>
            </div>
            <div>
              <dt>Language model</dt>
              <dd>{boot.ai.available ? boot.ai.model : 'Not connected'}</dd>
            </div>
            <div>
              <dt>Resume privacy</dt>
              <dd>Stored in the workspace database</dd>
            </div>
            <div>
              <dt>Scheduled searches</dt>
              <dd>Require the server to run</dd>
            </div>
          </dl>
          <p className="ws-muted">
            An administrator can connect Ollama or enable Gemini. Hosted AI requires your consent
            before sending resume text to the provider. Suggestions always need your review.
          </p>
          <p className="ws-muted">
            Accounts are scoped to this installation. Your account export includes your profile,
            resume text and application records.
          </p>
          <h3>Account activity</h3>
          <p className="ws-muted">
            The administrator can see account actions, discovery run totals and outcomes.
            {boot.activity?.enabled
              ? ' First-party page views and presence are enabled; active means a visible workspace with recent interaction.'
              : ' Browser presence and page-view collection are paused.'}{' '}
            Activity records are retained for {boot.activity?.retentionDays || 90} days. Resume
            text, field contents, passwords and tokens are excluded from activity tracking. No
            advertising pixel or session replay is used.
          </p>
          <a className="ws-button" href="/api/account/export" download>
            Export my account data
          </a>
        </section>
      </div>
    </>
  )
}
function MousePointerIcon() {
  return <ArrowUpRight size={25} />
}
function Admin({
  act,
  busy,
  refresh,
}: {
  act: Action
  busy: boolean
  refresh: () => Promise<void>
}) {
  const [users, setUsers] = useState<User[]>([]),
    [sources, setSources] = useState<Source[]>([]),
    [runs, setRuns] = useState<Run[]>([]),
    [settings, setSettings] = useState<Settings | null>(null)
  const [sourceName, setSourceName] = useState(''),
    [sourceType, setSourceType] = useState<Source['type']>('greenhouse'),
    [slug, setSlug] = useState('')
  const load = useCallback(async () => {
    const d = await api<{ users: User[]; sources: Source[]; runs: Run[]; settings: Settings }>(
      '/admin',
    )
    setUsers(d.users)
    setSources(d.sources)
    setRuns(d.runs)
    setSettings(d.settings)
  }, [])
  useEffect(() => {
    void act(load)
  }, [])
  function submit(e: FormEvent) {
    e.preventDefault()
    void act(async () => {
      await api('/admin/settings', 'PATCH', settings)
      await refresh()
    }, 'Workspace settings saved.')
  }
  function add(e: FormEvent) {
    e.preventDefault()
    void act(async () => {
      await api('/admin/sources', 'POST', {
        name: sourceName,
        type: sourceType,
        slug: sourceType === 'arbeitnow' ? '' : slug,
        enabled: true,
      })
      setSourceName('')
      setSlug('')
      await load()
    }, 'Source added. Run discovery to collect its openings.')
  }
  return (
    <>
      <Heading
        eyebrow="BEHIND THE POSSIBILITIES"
        title="Shape the workspace."
        description="Real controls for connected sources, discovery, appearance, and AI."
      />
      {settings && (
        <form className="ws-panel" onSubmit={submit}>
          <div className="ws-section-top">
            <h2>Workspace preferences</h2>
            <ShieldCheck size={21} />
          </div>
          <div className="ws-form-grid">
            <Field label="Platform name">
              <input
                required
                maxLength={80}
                value={settings.brandName}
                onChange={(e) => setSettings({ ...settings, brandName: e.target.value })}
              />
            </Field>
            <Field label="Accent color">
              <input
                type="color"
                value={settings.accentColor}
                onChange={(e) => setSettings({ ...settings, accentColor: e.target.value })}
              />
            </Field>
            <Field
              label="Maximum roles per source"
              hint="A collection limit, not a promise of complete coverage."
            >
              <input
                type="number"
                min={1}
                max={500}
                value={settings.maxJobsPerSource}
                onChange={(e) =>
                  setSettings({ ...settings, maxJobsPerSource: Number(e.target.value) })
                }
              />
            </Field>
          </div>
          <AIAdminControls settings={settings} onChange={setSettings} />
          <div className="ws-row">
            <label className="ws-check">
              <input
                type="checkbox"
                checked={settings.discoveryEnabled}
                onChange={(e) => setSettings({ ...settings, discoveryEnabled: e.target.checked })}
              />
              Enable job discovery
            </label>
            <label className="ws-check">
              <input
                type="checkbox"
                checked={settings.aiEnabled}
                onChange={(e) => setSettings({ ...settings, aiEnabled: e.target.checked })}
              />
              Enable AI writing suggestions
            </label>
          </div>
          <Button primary type="submit" disabled={busy}>
            Save workspace settings <Check size={16} />
          </Button>
        </form>
      )}
      <section className="ws-panel ws-admin-section">
        <div className="ws-section-top">
          <h2>Connected sources & coverage</h2>
          <span className="ws-muted">
            {sources.filter((s) => s.enabled).length} enabled / {sources.length} configured
          </span>
        </div>
        <p className="ws-muted">
          Add any company with a supported public board, including small teams. This registry does
          not discover every company automatically.
        </p>
        <div className="ws-source-list">
          {sources.map((s) => (
            <div key={s.id}>
              <div>
                <strong>{s.name}</strong>
                <span className="ws-pill">{s.type}</span>
                <p>
                  {s.slug || 'Public aggregate feed'} · {s.jobCount} roles on last check ·{' '}
                  {date(s.lastRun)}
                </p>
                {s.lastError && <p className="ws-error">{s.lastError}</p>}
              </div>
              <div className="ws-row">
                <label className="ws-check">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    disabled={busy}
                    onChange={(e) => {
                      const enabled = e.target.checked
                      void act(async () => {
                        await api(`/admin/sources/${s.id}`, 'PATCH', { enabled })
                        await load()
                      }, 'Source updated.')
                    }}
                  />
                  Enabled
                </label>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await api(`/admin/sources/${s.id}`, 'DELETE')
                      await load()
                    }, 'Source removed. Historical tracked jobs are retained.')
                  }
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
        <form onSubmit={add} className="ws-source-form">
          <h3>Add a company board</h3>
          <div className="ws-form-grid">
            <Field label="Company / source name">
              <input
                required
                value={sourceName}
                maxLength={100}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder="Company name"
              />
            </Field>
            <Field label="Source provider">
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as Source['type'])}
              >
                {['greenhouse', 'lever', 'ashby', 'arbeitnow'].map((type) => (
                  <option value={type} key={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {sourceType !== 'arbeitnow' && (
            <Field
              label="Board identifier"
              hint="The company’s public board slug, not a full URL. Example: stripe for its Greenhouse board."
            >
              <input
                required
                pattern="[a-zA-Z0-9_-]+"
                maxLength={100}
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="company-slug"
              />
            </Field>
          )}
          <Button type="submit" primary disabled={busy}>
            Connect source <ArrowRight size={16} />
          </Button>
        </form>
      </section>
      <div className="ws-two-col ws-admin-section">
        <section className="ws-panel">
          <h2>Discovery history</h2>
          {!runs.length ? (
            <p className="ws-muted">No discovery runs yet.</p>
          ) : (
            <div className="ws-run-list">
              {runs.slice(0, 20).map((run) => (
                <div key={run.id}>
                  <div>
                    <strong>{run.status}</strong>
                    <span>{run.jobsFound} collected</span>
                  </div>
                  <p>{date(run.startedAt)}</p>
                  {run.error && <p className="ws-error">{run.error}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="ws-panel">
          <h2>People in this installation</h2>
          <div className="ws-users">
            {users.map((user) => (
              <div key={user.id}>
                <span className="ws-avatar">{user.name.slice(0, 1)}</span>
                <div>
                  <strong>{user.name}</strong>
                  <small>{user.email}</small>
                </div>
                <span className="ws-pill">{user.role}</span>
              </div>
            ))}
          </div>
          <p className="ws-muted">
            Each person’s resume, profile, notes and application states are private to their
            account. Job-source listings are shared.
          </p>
        </section>
      </div>
    </>
  )
}
