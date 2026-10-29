import express, { type Request, type Response, type NextFunction } from 'express'
import { DatabaseSync } from 'node:sqlite'
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Entitlements, MonetizationAdmin, MonetizationSettings } from '../shared/billing.ts'

type Options = { fetcher?: typeof fetch; env?: NodeJS.ProcessEnv; clock?: () => number }
type Row = Record<string, any>
export class BillingError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'BILLING_ERROR',
  ) {
    super(message)
  }
}
export function createBilling(db: DatabaseSync, options: Options = {}) {
  const env = options.env ?? process.env,
    fetcher = options.fetcher ?? fetch,
    clock = options.clock ?? Date.now
  const iso = () => new Date(clock()).toISOString()
  db.exec(`
    CREATE TABLE IF NOT EXISTS billing_settings(id INTEGER PRIMARY KEY CHECK(id=1),mode TEXT NOT NULL,price INTEGER NOT NULL);
    INSERT OR IGNORE INTO billing_settings VALUES(1,'paid',299);
    CREATE TABLE IF NOT EXISTS billing_access(user_id TEXT PRIMARY KEY,blocked INTEGER NOT NULL DEFAULT 0,reason TEXT);
    CREATE TABLE IF NOT EXISTS billing_complimentary(user_id TEXT PRIMARY KEY,note TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS billing_runs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,state TEXT NOT NULL,trial INTEGER NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS billing_checkout_attempts(user_id TEXT PRIMARY KEY,state TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS billing_plans(amount INTEGER PRIMARY KEY,provider_id TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS billing_subscriptions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,plan_id TEXT NOT NULL,amount INTEGER NOT NULL,status TEXT NOT NULL,paid_through INTEGER NOT NULL DEFAULT 0,cancelled INTEGER NOT NULL DEFAULT 0,url TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS billing_payments(id TEXT PRIMARY KEY,subscription_id TEXT NOT NULL,period_end INTEGER NOT NULL,valid INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS billing_events(id TEXT PRIMARY KEY,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS billing_audit(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,action TEXT NOT NULL,target_id TEXT,detail TEXT NOT NULL,created_at TEXT NOT NULL);
  `)
  const settings = (): MonetizationSettings => {
    const r = db.prepare('SELECT * FROM billing_settings WHERE id=1').get() as Row
    return { mode: r.mode, monthlyPriceInr: r.price, freeRunLimit: 5 }
  }
  const mode = (): 'test' | 'live' | 'unconfigured' =>
    env.RAZORPAY_KEY_ID?.startsWith('rzp_test_')
      ? 'test'
      : env.RAZORPAY_KEY_ID?.startsWith('rzp_live_')
        ? 'live'
        : 'unconfigured'
  const ready = () =>
    Boolean(
      env.RAZORPAY_KEY_SECRET &&
      env.RAZORPAY_WEBHOOK_SECRET &&
      mode() !== 'unconfigured' &&
      (mode() === 'test' || env.ALLOW_LIVE_PAYMENTS === 'true'),
    )
  const audit = (actor: string, action: string, target: string | null, detail: string) =>
    db
      .prepare('INSERT INTO billing_audit VALUES(?,?,?,?,?,?)')
      .run(randomUUID(), actor, action, target, detail, iso())
  const user = (uid: string): Row => {
    const r = db.prepare('SELECT id,name,email,role FROM users WHERE id=?').get(uid) as Row
    if (!r) throw new BillingError(404, 'Account not found')
    return r
  }
  const transaction = <T>(fn: () => T): T => {
    db.exec('BEGIN IMMEDIATE')
    try {
      const r = fn()
      db.exec('COMMIT')
      return r
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }
  const summary = (uid: string): Entitlements => {
    const u = user(uid),
      s = settings(),
      a = db.prepare('SELECT * FROM billing_access WHERE user_id=?').get(uid) as Row | undefined
    const runs = db
      .prepare(
        "SELECT SUM(CASE WHEN state='success' THEN 1 ELSE 0 END) used,SUM(CASE WHEN state='reserved' THEN 1 ELSE 0 END) reserved FROM billing_runs WHERE user_id=? AND trial=1",
      )
      .get(uid) as Row
    const sub = db
      .prepare(
        'SELECT * FROM billing_subscriptions WHERE user_id=? ORDER BY paid_through DESC LIMIT 1',
      )
      .get(uid) as Row | undefined
    const paid = db
      .prepare('SELECT MAX(paid_through) until FROM billing_subscriptions WHERE user_id=?')
      .get(uid) as Row
    const paidUntil = Number(paid.until) || 0,
      blocked = Boolean(a?.blocked),
      comp = Boolean(db.prepare('SELECT 1 FROM billing_complimentary WHERE user_id=?').get(uid))
    const access: Entitlements['access'] = blocked
      ? 'blocked'
      : u.role === 'admin'
        ? 'admin'
        : s.mode === 'free'
          ? 'global_free'
          : comp
            ? 'complimentary'
            : paidUntil > clock() / 1000
              ? 'subscriber'
              : 'free'
    const premium = !['blocked', 'free'].includes(access),
      used = Number(runs.used) || 0,
      reserved = Number(runs.reserved) || 0,
      remaining = Math.max(0, 5 - used - reserved)
    return {
      access,
      mode: s.mode,
      blocked,
      blockReason: a?.reason ?? null,
      freeRunsUsed: used,
      freeRunsReserved: reserved,
      freeRunsLimit: 5,
      freeRunsRemaining: remaining,
      canDiscover: !blocked && (premium || remaining > 0),
      canUseAi: premium,
      canSchedule: premium,
      canUseExtension: premium,
      paidThrough: paidUntil ? new Date(paidUntil * 1000).toISOString() : null,
      subscriptionStatus: sub?.status ?? null,
      renewalCancelled: Boolean(sub?.cancelled),
      monthlyPriceInr: s.monthlyPriceInr,
      checkoutReady: ready(),
      paymentMode: mode(),
      message: blocked
        ? 'Account blocked. Billing cancellation remains available.'
        : premium
          ? 'All features unlocked.'
          : `${remaining} of 5 lifetime discovery scans remaining.`,
    }
  }
  const guard = (uid: string, feature: 'discover' | 'ai' | 'schedule' | 'extension' | 'access') => {
    const s = summary(uid)
    if (s.blocked)
      throw new BillingError(403, s.blockReason || 'Account blocked', 'ACCOUNT_BLOCKED')
    const allowed =
      feature === 'access' ||
      (feature === 'discover'
        ? s.canDiscover
        : feature === 'ai'
          ? s.canUseAi
          : feature === 'schedule'
            ? s.canSchedule
            : s.canUseExtension)
    if (!allowed)
      throw new BillingError(
        402,
        feature === 'discover'
          ? 'Five free discovery scans used. Subscribe to continue.'
          : 'Subscription required for this feature.',
        'SUBSCRIPTION_REQUIRED',
      )
    return s
  }
  const reserveDiscovery = (uid: string, id: string) =>
    transaction(() => {
      const existing = db.prepare('SELECT * FROM billing_runs WHERE id=?').get(id) as
        Row | undefined
      if (existing) {
        if (existing.user_id !== uid) throw new BillingError(409, 'Run belongs to another account')
        throw new BillingError(409, 'Run already reserved or settled', 'RUN_ALREADY_RESERVED')
      }
      const s = guard(uid, 'discover')
      db.prepare('INSERT INTO billing_runs VALUES(?,?,?,?,?)').run(
        id,
        uid,
        'reserved',
        s.access === 'free' ? 1 : 0,
        iso(),
      )
      return summary(uid)
    })
  const settleDiscovery = (id: string, success: boolean) => {
    db.prepare("UPDATE billing_runs SET state=? WHERE id=? AND state='reserved'").run(
      success ? 'success' : 'released',
      id,
    )
  }
  const recoverReservations = () =>
    db.prepare("UPDATE billing_runs SET state='released' WHERE state='reserved'").run().changes
  const locks = new Map<string, Promise<unknown>>()
  const lock = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const prev = locks.get(key) ?? Promise.resolve()
    const p = prev.catch(() => {}).then(fn)
    locks.set(key, p)
    try {
      return await p
    } finally {
      if (locks.get(key) === p) locks.delete(key)
    }
  }
  const api = async (path: string, body?: unknown): Promise<Row> => {
    if (!ready())
      throw new BillingError(
        503,
        'Configure Razorpay test keys and webhook secret; live payments also require ALLOW_LIVE_PAYMENTS=true.',
        'CHECKOUT_UNCONFIGURED',
      )
    const response = await fetcher(`https://api.razorpay.com/v1${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    })
    if (!response.ok)
      throw new BillingError(
        502,
        'Payment provider request failed. Retry from Billing.',
        'PROVIDER_ERROR',
      )
    return (await response.json()) as Row
  }
  const validId = (id: unknown, prefix: string): id is string =>
    typeof id === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(id)
  const owned = (id: string, uid?: string): Row => {
    const s = db.prepare('SELECT * FROM billing_subscriptions WHERE id=?').get(id) as
      Row | undefined
    if (!s || (uid && s.user_id !== uid)) throw new BillingError(404, 'Subscription not found')
    return s
  }
  const reconcile = async (id: string) =>
    lock(id, async () => {
      const local = owned(id),
        remote = await api(`/subscriptions/${id}`)
      if (
        remote.id !== id ||
        remote.plan_id !== local.plan_id ||
        remote.notes?.user_id !== local.user_id
      )
        throw new BillingError(502, 'Provider subscription identity mismatch')
      const plan = await api(`/plans/${local.plan_id}`)
      if (
        plan.id !== local.plan_id ||
        plan.period !== 'monthly' ||
        plan.interval !== 1 ||
        plan.item?.amount !== local.amount ||
        plan.item?.currency !== 'INR'
      )
        throw new BillingError(502, 'Provider plan mismatch')
      // Previously earned periods are rechecked so refunds revoke access even after cancellation.
      const grants = db
        .prepare('SELECT * FROM billing_payments WHERE subscription_id=?')
        .all(id) as Row[]
      const invoices = await api(`/invoices?subscription_id=${encodeURIComponent(id)}&count=100`)
      if (!Array.isArray(invoices.items)) throw new BillingError(502, 'Invalid invoice response')
      const candidates = new Map<string, number>(grants.map((g) => [g.id, g.period_end]))
      for (const invoice of invoices.items) {
        if (
          invoice.subscription_id !== id ||
          invoice.status !== 'paid' ||
          invoice.currency !== 'INR' ||
          invoice.amount_paid !== local.amount ||
          !validId(invoice.payment_id, 'pay')
        )
          continue
        const start = Number(remote.current_start),
          end = Number(remote.current_end),
          issued = Number(invoice.paid_at ?? invoice.issued_at)
        if (
          Number.isFinite(start) &&
          Number.isFinite(end) &&
          end > start &&
          end - start <= 40 * 86400 &&
          end <= clock() / 1000 + 40 * 86400 &&
          issued >= start - 300 &&
          issued <= end
        )
          candidates.set(invoice.payment_id, end)
      }
      const verified: { id: string; end: number; valid: boolean }[] = []
      for (const [pid, end] of candidates) {
        const p = await api(`/payments/${pid}`)
        const valid =
          p.id === pid &&
          p.status === 'captured' &&
          p.captured === true &&
          p.amount === local.amount &&
          p.currency === 'INR' &&
          Number(p.amount_refunded ?? 0) === 0 &&
          p.refund_status !== 'full' &&
          p.refund_status !== 'partial' &&
          invoices.items.some(
            (i: Row) =>
              i.payment_id === pid &&
              i.subscription_id === id &&
              i.id === p.invoice_id &&
              i.amount_paid === local.amount,
          )
        verified.push({ id: pid, end, valid })
      }
      transaction(() => {
        for (const p of verified)
          db.prepare(
            'INSERT INTO billing_payments VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET valid=excluded.valid',
          ).run(p.id, id, p.end, p.valid ? 1 : 0)
        const until = db
          .prepare(
            'SELECT MAX(period_end) until FROM billing_payments WHERE subscription_id=? AND valid=1',
          )
          .get(id) as Row
        db.prepare(
          'UPDATE billing_subscriptions SET status=?,paid_through=?,cancelled=? WHERE id=?',
        ).run(
          String(remote.status),
          Number(until.until) || 0,
          remote.status === 'cancelled' || remote.cancel_at_cycle_end ? 1 : local.cancelled,
          id,
        )
      })
      return summary(local.user_id)
    })
  const cancel = async (id: string) =>
    lock(id, async () => {
      const s = owned(id)
      if (s.cancelled || ['cancelled', 'completed', 'expired'].includes(s.status)) return
      let r = await api(`/subscriptions/${id}/cancel`, { cancel_at_cycle_end: 1 })
      const confirmed = (v: Row) =>
        v.id === id &&
        (['cancelled', 'completed', 'expired'].includes(v.status) ||
          v.cancel_at_cycle_end === true ||
          v.cancel_at_cycle_end === 1)
      if (!confirmed(r)) r = await api(`/subscriptions/${id}`)
      if (!confirmed(r))
        throw new BillingError(
          502,
          'Provider did not confirm cancellation; renewal remains active.',
          'CANCELLATION_UNCONFIRMED',
        )
      db.prepare('UPDATE billing_subscriptions SET cancelled=1,status=? WHERE id=?').run(
        r.status,
        id,
      )
    })
  const active = () =>
    db
      .prepare(
        "SELECT * FROM billing_subscriptions WHERE cancelled=0 AND status NOT IN ('cancelled','completed','expired')",
      )
      .all() as Row[]
  const router = express.Router()
  const route =
    (fn: (req: Request, res: Response) => unknown) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await fn(req, res)
      } catch (e) {
        if (e instanceof BillingError)
          return res.status(e.status).json({ error: e.message, code: e.code })
        if (e instanceof z.ZodError)
          return res.status(400).json({ error: 'Invalid billing request' })
        next(e)
      }
    }
  const uid = (req: Request) => {
    const id = (req as any).user?.id
    if (!id) throw new BillingError(401, 'Sign in required')
    return user(id).id as string
  }
  const admin = (req: Request) => {
    const id = uid(req)
    guard(id, 'access')
    if (user(id).role !== 'admin') throw new BillingError(403, 'Admin access required')
    return id
  }
  const adminSummary = (): MonetizationAdmin => ({
    settings: settings(),
    users: (db.prepare('SELECT id,name,email,role FROM users').all() as Row[]).map((u) => ({
      ...u,
      entitlements: summary(u.id),
    })) as MonetizationAdmin['users'],
    complimentaryIds: (db.prepare('SELECT user_id FROM billing_complimentary').all() as Row[]).map(
      (r) => r.user_id,
    ),
    audit: db
      .prepare(
        'SELECT id,actor_id actorId,action,target_id targetId,detail,created_at createdAt FROM billing_audit ORDER BY created_at DESC LIMIT 100',
      )
      .all() as unknown as MonetizationAdmin['audit'],
    activeSubscriptions: active().length,
    checkoutReady: ready(),
    paymentMode: mode(),
    message: ready()
      ? 'Payment gateway configured.'
      : 'Payment credentials required; no payments can be initiated.',
  })
  router.get(
    '/billing',
    route((req, res) => res.json({ entitlements: summary(uid(req)) })),
  )
  router.post(
    '/billing/checkout',
    route(async (req, res) => {
      const id = uid(req)
      guard(id, 'access')
      return lock('settings', async () => {
        if (settings().mode === 'free') throw new BillingError(409, 'Platform is currently free')
        const s = summary(id)
        if (s.access !== 'free') throw new BillingError(409, 'All features already unlocked')
        const old = db
          .prepare(
            "SELECT * FROM billing_subscriptions WHERE user_id=? AND cancelled=0 AND status NOT IN ('cancelled','completed','expired') LIMIT 1",
          )
          .get(id) as Row | undefined
        if (old) {
          if (old.url) return res.json({ url: old.url, subscriptionId: old.id })
          throw new BillingError(409, 'An existing subscription requires reconciliation')
        }
        const amount = settings().monthlyPriceInr * 100
        let p = db.prepare('SELECT provider_id FROM billing_plans WHERE amount=?').get(amount) as
          Row | undefined
        if (!p) {
          const r = await api('/plans', {
            period: 'monthly',
            interval: 1,
            item: { name: 'Job-Hunter Pro', amount, currency: 'INR' },
          })
          if (!validId(r.id, 'plan')) throw new BillingError(502, 'Invalid provider plan')
          db.prepare('INSERT OR IGNORE INTO billing_plans VALUES(?,?)').run(amount, r.id)
          p = db.prepare('SELECT provider_id FROM billing_plans WHERE amount=?').get(amount) as Row
        }
        if (db.prepare('SELECT 1 FROM billing_checkout_attempts WHERE user_id=?').get(id))
          throw new BillingError(
            409,
            'A previous checkout needs provider reconciliation before retry. Contact support.',
            'CHECKOUT_PENDING_RECONCILIATION',
          )
        guard(id, 'access')
        db.prepare('INSERT INTO billing_checkout_attempts VALUES(?,?,?)').run(id, 'creating', iso())
        const r = await api('/subscriptions', {
          plan_id: p!.provider_id,
          total_count: 120,
          quantity: 1,
          customer_notify: 1,
          notes: { user_id: id },
        })
        if (
          !validId(r.id, 'sub') ||
          typeof r.short_url !== 'string' ||
          !/^https:\/\/rzp\.io\//.test(r.short_url)
        )
          throw new BillingError(502, 'Invalid provider checkout')
        db.prepare(
          'INSERT INTO billing_subscriptions(id,user_id,plan_id,amount,status,url) VALUES(?,?,?,?,?,?)',
        ).run(r.id, id, p!.provider_id, amount, r.status, r.short_url)
        db.prepare('DELETE FROM billing_checkout_attempts WHERE user_id=?').run(id)
        audit(id, 'checkout_created', id, `Subscription ${r.id}; INR ${amount / 100}/month`)
        if (summary(id).blocked) {
          try {
            await cancel(r.id)
          } catch {
            audit(
              id,
              'blocked_checkout_cancellation_failed',
              id,
              'New checkout created during block; provider cancellation requires retry',
            )
          }
          throw new BillingError(403, 'Account blocked; checkout withdrawn.', 'ACCOUNT_BLOCKED')
        }
        res.json({ url: r.short_url, subscriptionId: r.id })
      })
    }),
  )
  router.post(
    '/billing/cancel',
    route(async (req, res) => {
      const id = uid(req)
      await lock('settings', async () => {
        for (const s of active().filter((s) => s.user_id === id)) await cancel(s.id)
      })
      audit(id, 'renewal_cancelled', id, 'Renewal cancelled; verified paid period retained')
      res.json({ entitlements: summary(id) })
    }),
  )
  router.post(
    '/billing/reconcile',
    route(async (req, res) => {
      const id = uid(req)
      for (const s of db
        .prepare('SELECT id FROM billing_subscriptions WHERE user_id=?')
        .all(id) as Row[])
        await reconcile(s.id)
      res.json({ entitlements: summary(id) })
    }),
  )
  router.get(
    '/admin/monetization',
    route((req, res) => {
      admin(req)
      res.json(adminSummary())
    }),
  )
  router.patch(
    '/admin/monetization',
    route(async (req, res) => {
      const id = admin(req),
        data = z
          .object({
            mode: z.enum(['free', 'paid']).optional(),
            monthlyPriceInr: z.number().int().min(1).max(100000).optional(),
            cancelRenewals: z.boolean().optional(),
          })
          .strict()
          .parse(req.body)
      await lock('settings', async () => {
        if (
          data.mode === 'free' &&
          db.prepare('SELECT 1 FROM billing_checkout_attempts LIMIT 1').get()
        )
          throw new BillingError(
            409,
            'An interrupted checkout must be reconciled with the provider before enabling free mode.',
            'CHECKOUT_PENDING_RECONCILIATION',
          )
        if (data.mode === 'free' && active().length) {
          if (!data.cancelRenewals)
            throw new BillingError(
              409,
              'Active subscriptions exist. Explicitly cancel renewals before enabling free mode.',
              'ACTIVE_RENEWALS',
            )
          try {
            for (const s of active()) await cancel(s.id)
          } catch (e) {
            audit(
              id,
              'free_mode_failed',
              null,
              'Cancellation failed; paid mode retained. Retry cancelling remaining renewals.',
            )
            throw e
          }
        }
        const s = settings()
        db.prepare('UPDATE billing_settings SET mode=?,price=? WHERE id=1').run(
          data.mode ?? s.mode,
          data.monthlyPriceInr ?? s.monthlyPriceInr,
        )
        audit(id, 'settings_changed', null, JSON.stringify(data))
        res.json(adminSummary())
      })
    }),
  )
  router.put(
    '/admin/complimentary/:userId',
    route((req, res) => {
      const actor = admin(req),
        id = String(req.params.userId)
      user(id)
      const d = z
        .object({ enabled: z.boolean(), note: z.string().max(500).optional() })
        .strict()
        .parse(req.body)
      if (d.enabled)
        db.prepare(
          'INSERT INTO billing_complimentary VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET note=excluded.note',
        ).run(id, d.note ?? '')
      else db.prepare('DELETE FROM billing_complimentary WHERE user_id=?').run(id)
      audit(actor, 'complimentary_changed', id, JSON.stringify(d))
      res.json({ entitlements: summary(id) })
    }),
  )
  router.patch(
    '/admin/users/:id/access',
    route(async (req, res) => {
      const actor = admin(req),
        id = String(req.params.id),
        u = user(id),
        d = z
          .object({
            blocked: z.boolean(),
            reason: z.string().max(500).optional(),
            cancelRenewal: z.boolean().optional(),
          })
          .strict()
          .parse(req.body)
      if (
        d.blocked &&
        u.role === 'admin' &&
        Number(
          (
            db
              .prepare(
                "SELECT COUNT(*) n FROM users u LEFT JOIN billing_access a ON a.user_id=u.id WHERE u.role='admin' AND COALESCE(a.blocked,0)=0",
              )
              .get() as Row
          ).n,
        ) <= 1
      )
        throw new BillingError(409, 'The last active administrator cannot be blocked')
      db.prepare(
        'INSERT INTO billing_access VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET blocked=excluded.blocked,reason=excluded.reason',
      ).run(id, d.blocked ? 1 : 0, d.reason ?? null)
      audit(actor, 'account_access_changed', id, JSON.stringify(d))
      let cancellationStatus = 'not_requested'
      if (d.cancelRenewal) {
        try {
          await lock('settings', async () => {
            for (const s of active().filter((s) => s.user_id === id)) await cancel(s.id)
          })
          cancellationStatus = 'cancelled'
        } catch {
          cancellationStatus = 'failed_retry_required'
          audit(
            actor,
            'block_cancellation_failed',
            id,
            'Access changed immediately; renewal cancellation requires retry',
          )
        }
      }
      res.json({ entitlements: summary(id), cancellationStatus })
    }),
  )
  const webhook = route(async (req, res) => {
    if (!env.RAZORPAY_WEBHOOK_SECRET) throw new BillingError(503, 'Webhook not configured')
    if (!Buffer.isBuffer(req.body)) throw new BillingError(400, 'Raw webhook body required')
    const signature = req.get('x-razorpay-signature') ?? '',
      expected = createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(req.body).digest()
    if (
      !/^[a-f0-9]{64}$/i.test(signature) ||
      !timingSafeEqual(expected, Buffer.from(signature, 'hex'))
    )
      throw new BillingError(401, 'Invalid webhook signature')
    const eventId = req.get('x-razorpay-event-id')
    if (!eventId || eventId.length > 200) throw new BillingError(400, 'Event ID required')
    let event: Row
    try {
      event = JSON.parse(req.body.toString())
    } catch {
      throw new BillingError(400, 'Invalid event JSON')
    }
    if (
      event.entity !== 'event' ||
      typeof event.event !== 'string' ||
      !event.payload ||
      typeof event.payload !== 'object'
    )
      throw new BillingError(400, 'Invalid event schema')
    await lock(`event:${eventId}`, async () => {
      if (db.prepare('SELECT 1 FROM billing_events WHERE id=?').get(eventId)) return
      let subId = event.payload.subscription?.entity?.id
      if (!subId) {
        const paymentId =
          event.payload.payment?.entity?.id ?? event.payload.refund?.entity?.payment_id
        if (validId(paymentId, 'pay')) {
          const grant = db
            .prepare('SELECT subscription_id FROM billing_payments WHERE id=?')
            .get(paymentId) as Row | undefined
          subId = grant?.subscription_id
        }
      }
      if (subId) {
        if (!validId(subId, 'sub')) throw new BillingError(400, 'Invalid subscription ID')
        if (db.prepare('SELECT 1 FROM billing_subscriptions WHERE id=?').get(subId))
          await reconcile(subId)
      }
      db.prepare('INSERT INTO billing_events VALUES(?,?)').run(eventId, iso())
    })
    res.json({ received: true })
  })
  return {
    summary,
    guard,
    reserveDiscovery,
    settleDiscovery,
    recoverReservations,
    router,
    webhook,
    reconcile,
    settings,
    adminSummary,
    checkoutReady: ready,
  }
}
