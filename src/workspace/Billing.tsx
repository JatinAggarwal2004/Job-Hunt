import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowUpRight,
  Check,
  CheckCheck,
  Copy,
  CreditCard,
  Gift,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { api } from './api'
import type { AccessUser, Entitlements, MonetizationAdmin } from '../../shared/billing'
import './billing.css'

type Action = (work: () => Promise<void>, success?: string) => Promise<void>
type Props = { act: Action; busy: boolean; onChanged: () => Promise<void> }
const money = (amount: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
const day = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'Not available'
const accessNames: Record<Entitlements['access'], string> = {
  blocked: 'Account blocked',
  admin: 'Administrator',
  global_free: 'Free for everyone',
  complimentary: 'Complimentary Pro',
  subscriber: 'Pro member',
  free: 'Free plan',
}
export function smallAccessSummary(access: Entitlements) {
  return accessNames[access.access]
}
function BButton({
  children,
  primary = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button type="button" className={`ws-button ${primary ? 'ws-primary' : ''}`} {...props}>
      {children}
    </button>
  )
}
function Confirmation({
  title,
  children,
  label,
  onConfirm,
  onClose,
  busy,
}: {
  title: string
  children: ReactNode
  label: string
  onConfirm: () => void
  onClose: () => void
  busy: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog
      className="billing-dialog"
      ref={ref}
      aria-labelledby="billing-dialog-title"
      onCancel={(event) => {
        if (busy) event.preventDefault()
        else onClose()
      }}
    >
      <h2 id="billing-dialog-title">{title}</h2>
      <div>{children}</div>
      <div className="billing-actions">
        <BButton onClick={onClose} disabled={busy}>
          Keep current setting
        </BButton>
        <BButton primary disabled={busy} onClick={onConfirm}>
          {busy ? 'Updating…' : label}
        </BButton>
      </div>
    </dialog>
  )
}
export function BillingView({ act, busy, onChanged }: Props) {
  const [access, setAccess] = useState<Entitlements | null>(null)
  const [error, setError] = useState('')
  const [cancel, setCancel] = useState(false)
  async function load() {
    const data = await api<{ entitlements: Entitlements }>('/billing')
    setAccess(data.entitlements)
    setError('')
  }
  useEffect(() => {
    let live = true
    api<{ entitlements: Entitlements }>('/billing')
      .then((data) => {
        if (live) setAccess(data.entitlements)
      })
      .catch((err) => {
        if (live) setError((err as Error).message)
      })
    return () => {
      live = false
    }
  }, [])
  const reconcile = () =>
    act(async () => {
      const result = await api<{ entitlements: Entitlements }>('/billing/reconcile', 'POST')
      setAccess(result.entitlements)
      await onChanged()
    }, 'Payment status checked with the provider.')
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('billing') === 'return' || params.has('razorpay_subscription_id'))
      void reconcile()
    // Provider state is always verified by the server; URL parameters never grant access.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!access)
    return (
      <section className="ws-panel billing-loading" aria-live="polite">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <BButton onClick={() => void act(load)}>Try again</BButton>
          </>
        ) : (
          'Loading your plan…'
        )}
      </section>
    )
  const full = !['free', 'blocked'].includes(access.access)
  const subscription = !!access.subscriptionStatus
  const canCancel =
    subscription &&
    !access.renewalCancelled &&
    !['cancelled', 'completed', 'expired'].includes(access.subscriptionStatus || '')
  return (
    <div className="billing-page">
      <div className="billing-title">
        <p className="ws-eyebrow">YOUR MEMBERSHIP</p>
        <h1>A little more momentum.</h1>
        <p>
          Your search, your pace. Start with five successful scans, then unlock the full workspace
          when you need it.
        </p>
      </div>
      <section className="ws-panel billing-status" aria-label="Your current access">
        <div className="billing-status-icon">
          <ShieldCheck size={24} />
        </div>
        <div>
          <span className="billing-label">YOUR CURRENT ACCESS</span>
          <h2>{accessNames[access.access]}</h2>
          <p>{access.message}</p>
          {access.blocked && access.blockReason && <p role="alert">Reason: {access.blockReason}</p>}
          {access.paidThrough && <p>Paid access through {day(access.paidThrough)}.</p>}
        </div>
        <span className="billing-pill">
          {access.blocked
            ? 'Feature access blocked'
            : access.mode === 'free'
              ? 'All features available'
              : full
                ? 'Pro features unlocked'
                : `${access.freeRunsRemaining} scans left`}
        </span>
      </section>
      <div className="billing-plans">
        <section
          className={`ws-panel billing-plan ${access.access === 'free' ? 'billing-plan-current' : ''}`}
        >
          <span className="billing-label">A THOUGHTFUL START</span>
          <h2>Free</h2>
          <p className="billing-price">
            ₹0 <span>to get started</span>
          </p>
          <p>Find your direction before committing.</p>
          <ul className="billing-feature-list">
            {[
              '5 successful discovery scans per account, for life',
              'Multiple roles and search preferences',
              'Resume parsing and rules-based feedback',
              'Saved jobs and application tracking',
            ].map((item) => (
              <li key={item}>
                <Check size={16} />
                {item}
              </li>
            ))}
          </ul>
          <div
            className="billing-meter"
            role="meter"
            aria-label="Free discovery scans remaining"
            aria-valuemin={0}
            aria-valuemax={access.freeRunsLimit}
            aria-valuenow={access.freeRunsRemaining}
          >
            <span
              style={{
                width: `${Math.max(0, Math.min(100, (access.freeRunsRemaining / Math.max(1, access.freeRunsLimit)) * 100))}%`,
              }}
            />
          </div>
          <small>
            {access.freeRunsRemaining} of {access.freeRunsLimit} free scans remain
            {access.freeRunsReserved > 0 ? ` · ${access.freeRunsReserved} in progress` : ''}. Failed
            scans return to your balance.
          </small>
        </section>
        <section className="ws-panel billing-plan billing-pro">
          <div className="billing-plan-top">
            <span className="billing-label">THE FULL WORKSPACE</span>
            <span className="billing-pill">
              <Sparkles size={13} /> Pro
            </span>
          </div>
          <h2>Make room for your next role.</h2>
          <p className="billing-price">
            {money(access.monthlyPriceInr)} <span>/ month</span>
          </p>
          <p>Everything in Free, with your search moving in the background.</p>
          <ul className="billing-feature-list">
            {[
              'Discovery beyond the five free scans',
              'Scheduled daily discovery',
              'AI drafting and resume suggestions',
              'Application assistant extension',
            ].map((item) => (
              <li key={item}>
                <CheckCheck size={16} />
                {item}
              </li>
            ))}
          </ul>
          {access.mode === 'free' ? (
            <div className="billing-inline-note">
              <Gift size={18} />
              <p>All features are currently free. No subscription is needed.</p>
            </div>
          ) : full ? (
            <div className="billing-inline-note">
              <Check size={18} />
              <p>
                {access.access === 'subscriber'
                  ? 'Your Pro access is active.'
                  : 'Your account already has all features.'}
              </p>
            </div>
          ) : (
            <BButton
              primary
              disabled={busy || !access.checkoutReady || access.blocked}
              onClick={() =>
                void act(async () => {
                  const data = await api<{ url: string }>('/billing/checkout', 'POST')
                  const target = new URL(data.url)
                  if (target.protocol !== 'https:')
                    throw new Error('The payment provider returned an invalid checkout link.')
                  window.location.assign(target.href)
                })
              }
            >
              <CreditCard size={16} />
              {access.checkoutReady ? 'Continue to secure checkout' : 'Checkout coming soon'}
              <ArrowUpRight size={15} />
            </BButton>
          )}
          {!access.checkoutReady && access.mode === 'paid' && (
            <small>Payments are not configured yet. No payment will be taken.</small>
          )}
          {access.paymentMode === 'test' && (
            <small className="billing-test">
              Payment sandbox is active. Test payments do not represent a live purchase.
            </small>
          )}
          <small>
            AI features require a configured model. Job coverage depends on connected sources.
            Review applications before submitting.
          </small>
        </section>
      </div>
      <section className="ws-panel billing-manage">
        <div>
          <h2>Manage your membership</h2>
          <p>
            {subscription
              ? access.renewalCancelled
                ? `Renewal is cancelled. Your verified paid access remains available${access.paidThrough ? ` through ${day(access.paidThrough)}` : ''}.`
                : `Provider status: ${access.subscriptionStatus}. Cancellation stops future renewals and preserves your verified paid period.`
              : 'Already completed checkout? Check the provider status here. Access updates only after server verification.'}
          </p>
        </div>
        <div className="billing-actions">
          <BButton disabled={busy} onClick={() => void reconcile()}>
            <RefreshCw size={15} />
            Check payment status
          </BButton>
          {canCancel && (
            <BButton disabled={busy} onClick={() => setCancel(true)}>
              Cancel renewal
            </BButton>
          )}
        </div>
      </section>
      {cancel && (
        <Confirmation
          title="Stop future renewals?"
          label="Cancel renewal"
          busy={busy}
          onClose={() => setCancel(false)}
          onConfirm={() =>
            void act(async () => {
              await api('/billing/cancel', 'POST')
              await load()
              await onChanged()
              setCancel(false)
            }, 'Renewal cancelled. Your verified paid period remains available.')
          }
        >
          <p>
            You will keep access through your current verified paid period. This action cancels
            future charges; it does not refund a previous payment.
          </p>
        </Confirmation>
      )}
    </div>
  )
}
function UserAccessCard({
  user,
  complimentary,
  act,
  busy,
  refresh,
}: {
  user: AccessUser
  complimentary: boolean
  act: Action
  busy: boolean
  refresh: () => Promise<void>
}) {
  const [blocked, setBlocked] = useState(user.entitlements.blocked),
    [reason, setReason] = useState(user.entitlements.blockReason || ''),
    [comp, setComp] = useState(complimentary),
    [note, setNote] = useState(''),
    [cancelRenewal, setCancelRenewal] = useState(false),
    [review, setReview] = useState(false),
    [copied, setCopied] = useState(false)
  useEffect(() => {
    setBlocked(user.entitlements.blocked)
    setReason(user.entitlements.blockReason || '')
    setComp(complimentary)
  }, [user, complimentary])
  const changedAccess =
    blocked !== user.entitlements.blocked || reason !== (user.entitlements.blockReason || '')
  const changedComp = comp !== complimentary
  async function save() {
    if (changedAccess || cancelRenewal) {
      const result = await api<{ cancellationStatus?: string }>(
        `/admin/users/${encodeURIComponent(user.id)}/access`,
        'PATCH',
        { blocked, reason, cancelRenewal },
      )
      if (result.cancellationStatus === 'failed_retry_required') {
        setReview(false)
        await refresh()
        throw new Error(
          'Account access changed, but renewal cancellation failed. Select “Also stop subscription renewal” and retry; the account owner can also cancel from Membership.',
        )
      }
    }
    if (changedComp)
      await api(`/admin/complimentary/${encodeURIComponent(user.id)}`, 'PUT', {
        enabled: comp,
        note,
      })
    setReview(false)
    setCancelRenewal(false)
    await refresh()
  }
  return (
    <article className="billing-user">
      <div className="billing-user-header">
        <div>
          <h3>
            {user.name} <span className="billing-role">{user.role}</span>
          </h3>
          <p>{user.email}</p>
        </div>
        <span className={`billing-pill ${user.entitlements.blocked ? 'billing-warning' : ''}`}>
          {accessNames[user.entitlements.access]}
        </span>
      </div>
      <div className="billing-user-id">
        <code>{user.id}</code>
        <button
          type="button"
          aria-label={`Copy user ID for ${user.name}`}
          onClick={() =>
            void act(async () => {
              await navigator.clipboard.writeText(user.id)
              setCopied(true)
            }, 'User ID copied.')
          }
        >
          <Copy size={14} />
          {copied ? 'Copied' : 'Copy ID'}
        </button>
      </div>
      <p className="billing-user-summary">
        {user.entitlements.message}
        {user.entitlements.renewalCancelled ? ' Subscription renewal is cancelled.' : ''}
        {user.entitlements.paidThrough
          ? ` Paid through ${day(user.entitlements.paidThrough)}.`
          : ''}
      </p>
      <div className="billing-user-controls">
        <label className="billing-check">
          <input
            type="checkbox"
            checked={comp}
            disabled={busy}
            onChange={(event) => setComp(event.target.checked)}
          />
          <span>
            Complimentary access <small>Unlock all features without payment.</small>
          </span>
        </label>
        <label className="billing-check">
          <input
            type="checkbox"
            checked={blocked}
            disabled={busy}
            onChange={(event) => setBlocked(event.target.checked)}
          />
          <span>
            Block account <small>Overrides paid, free and complimentary access.</small>
          </span>
        </label>
      </div>
      {(comp || changedComp) && (
        <label className="ws-field">
          <span>Complimentary access note</span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="For example: early access partner"
            maxLength={500}
          />
        </label>
      )}
      {blocked && (
        <label className="ws-field">
          <span>Reason shown to the account owner</span>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            placeholder="Explain why access is blocked"
          />
        </label>
      )}
      {blocked && user.entitlements.subscriptionStatus && !user.entitlements.renewalCancelled && (
        <label className="billing-check">
          <input
            type="checkbox"
            checked={cancelRenewal}
            onChange={(event) => setCancelRenewal(event.target.checked)}
          />
          <span>
            Also stop subscription renewal{' '}
            <small>
              Blocking alone does not cancel billing. The owner can still manage cancellation.
            </small>
          </span>
        </label>
      )}
      <BButton
        disabled={busy || (!changedAccess && !changedComp && !cancelRenewal)}
        onClick={() => setReview(true)}
      >
        Review access changes
      </BButton>
      {review && (
        <Confirmation
          title={`Update access for ${user.name}?`}
          label="Save account access"
          busy={busy}
          onClose={() => setReview(false)}
          onConfirm={() => void act(save, 'Account access updated.')}
        >
          <p>{user.email}</p>
          <p>
            Account will be {blocked ? 'blocked from product features' : 'unblocked'}. Complimentary
            Pro will be {comp ? 'enabled' : 'disabled'}.
            {cancelRenewal && blocked ? ' Subscription renewal will also be cancelled.' : ''}
          </p>
          <p>
            Verified paid access is retained in the account record. The server protects the last
            administrator from being blocked.
          </p>
        </Confirmation>
      )}
    </article>
  )
}
export function MonetizationPanel({ act, busy, onChanged }: Props) {
  const [data, setData] = useState<MonetizationAdmin | null>(null),
    [error, setError] = useState(''),
    [mode, setMode] = useState<'free' | 'paid'>('paid'),
    [price, setPrice] = useState('299'),
    [query, setQuery] = useState(''),
    [review, setReview] = useState(false)
  async function load() {
    const next = await api<MonetizationAdmin>('/admin/monetization')
    setData(next)
    setMode(next.settings.mode)
    setPrice(String(next.settings.monthlyPriceInr))
    setError('')
  }
  async function refresh() {
    await load()
    await onChanged()
  }
  useEffect(() => {
    void load().catch((err) => setError((err as Error).message))
  }, [])
  if (!data)
    return (
      <section className="ws-panel" aria-live="polite">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <BButton onClick={() => void act(load)}>Retry monetization settings</BButton>
          </>
        ) : (
          'Loading monetization controls…'
        )}
      </section>
    )
  const amount = Number(price),
    validPrice = Number.isInteger(amount) && amount >= 1 && amount <= 100000
  const dirty = mode !== data.settings.mode || amount !== data.settings.monthlyPriceInr
  const filtered = data.users.filter((user) =>
    `${user.id} ${user.email} ${user.name}`.toLowerCase().includes(query.trim().toLowerCase()),
  )
  return (
    <section className="billing-admin">
      <div className="billing-admin-heading">
        <div>
          <p className="ws-eyebrow">BUSINESS CONTROLS</p>
          <h2>Access & subscriptions</h2>
          <p>Set your pricing, give selected accounts Pro, and manage account access.</p>
        </div>
        <span className="billing-pill">
          {data.paymentMode === 'live'
            ? 'Live payments'
            : data.paymentMode === 'test'
              ? 'Payment sandbox'
              : 'Payments unconfigured'}
        </span>
      </div>
      <div className="ws-panel">
        <h3>Platform pricing</h3>
        <p>{data.message}</p>
        <div className="billing-settings-grid">
          <label className="ws-field">
            <span>Access mode</span>
            <select
              value={mode}
              disabled={busy}
              onChange={(event) => setMode(event.target.value as 'paid' | 'free')}
            >
              <option value="paid">Paid — Free + Pro plans</option>
              <option value="free">Free — all features for everyone</option>
            </select>
          </label>
          <label className="ws-field">
            <span>Pro monthly price in ₹</span>
            <input
              type="number"
              min="1"
              max="100000"
              step="1"
              value={price}
              disabled={busy}
              onChange={(event) => setPrice(event.target.value)}
              aria-invalid={!validPrice}
            />
            <small>
              Applies to new subscriptions. Existing billing agreements retain their price.
            </small>
          </label>
        </div>
        <p className="billing-inline-note">
          <ShieldCheck size={18} />
          <span>
            Free accounts receive {data.settings.freeRunLimit} successful discovery scans for life.
            Blocking always overrides feature access.
          </span>
        </p>
        <BButton primary disabled={busy || !dirty || !validPrice} onClick={() => setReview(true)}>
          Review pricing changes
        </BButton>
      </div>
      <div className="ws-panel">
        <div className="billing-list-heading">
          <div>
            <h3>Accounts & complimentary list</h3>
            <p>
              {data.complimentaryIds.length} complimentary accounts · {data.activeSubscriptions}{' '}
              active subscriptions
            </p>
          </div>
          <label className="ws-field">
            <span>Find an account</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="User ID, email or name"
            />
          </label>
        </div>
        <div className="billing-users">
          {filtered.length ? (
            filtered.map((user) => (
              <UserAccessCard
                key={user.id}
                user={user}
                complimentary={data.complimentaryIds.includes(user.id)}
                act={act}
                busy={busy}
                refresh={refresh}
              />
            ))
          ) : (
            <p>No accounts match this search.</p>
          )}
        </div>
      </div>
      <div className="ws-panel">
        <h3>Recent access & billing activity</h3>
        {data.audit.length ? (
          <ol className="billing-audit">
            {data.audit.map((event) => (
              <li key={event.id}>
                <div>
                  <strong>{event.action.replaceAll('_', ' ')}</strong>
                  <span>{new Date(event.createdAt).toLocaleString('en-IN')}</span>
                </div>
                <p>{event.detail}</p>
                <small>
                  Actor: {event.actorId}
                  {event.targetId ? ` · Target: ${event.targetId}` : ''}
                </small>
              </li>
            ))}
          </ol>
        ) : (
          <p>Changes to billing and account access will appear here.</p>
        )}
      </div>
      {review && (
        <Confirmation
          title="Review platform pricing"
          label={
            mode === 'free' && data.activeSubscriptions > 0
              ? 'Stop renewals & make free'
              : 'Save pricing settings'
          }
          busy={busy}
          onClose={() => setReview(false)}
          onConfirm={() =>
            void act(async () => {
              await api('/admin/monetization', 'PATCH', {
                mode,
                monthlyPriceInr: amount,
                cancelRenewals: mode === 'free' && data.activeSubscriptions > 0,
              })
              await refresh()
              setReview(false)
            }, 'Pricing settings updated.')
          }
        >
          <p>
            Access mode:{' '}
            <strong>
              {mode === 'free' ? 'All features free for everyone' : 'Free and Pro subscriptions'}
            </strong>
            .
          </p>
          <p>
            New Pro subscriptions: <strong>{money(amount)} per month</strong>. Existing agreements
            keep their current price.
          </p>
          {mode === 'free' && data.activeSubscriptions > 0 && (
            <p className="billing-warning">
              This will cancel renewal for {data.activeSubscriptions} active subscriptions before
              switching to free mode, so customers are not charged for free access. Previously
              collected payments are not refunded.
            </p>
          )}
          {!data.checkoutReady && mode === 'paid' && (
            <p>
              Checkout stays disabled until Razorpay credentials and the webhook are configured on
              the server.
            </p>
          )}
        </Confirmation>
      )}
    </section>
  )
}
