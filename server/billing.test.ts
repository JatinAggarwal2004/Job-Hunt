import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import { DatabaseSync } from 'node:sqlite'
import { createHmac } from 'node:crypto'
import { createBilling } from './billing.ts'

function setup(configured = false) {
  const db = new DatabaseSync(':memory:')
  db.exec(
    `CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,email TEXT,role TEXT);INSERT INTO users VALUES('admin','Admin','a@example.test','admin'),('user','User','u@example.test','user'),('other','Other','o@example.test','user');`,
  )
  let time = Date.UTC(2026, 9, 29),
    price = 29900,
    refunded = 0,
    status = 'active',
    calls = 0
  const start = Math.floor(time / 1000) - 100,
    end = start + 30 * 86400
  let mutate: (path: string, value: any) => any = (_path, value) => value
  let failCancel = false
  let beforeFetch: (path: string) => Promise<void> = async () => {}
  const fetcher: typeof fetch = async (input, init) => {
    calls++
    const u = new URL(String(input))
    assert.equal(u.origin, 'https://api.razorpay.com')
    const p = u.pathname
    await beforeFetch(p)
    let result: unknown
    if (p === '/v1/plans' && init?.method === 'POST') {
      const b = JSON.parse(String(init.body))
      price = b.item.amount
      result = { id: `plan_${price}` }
    } else if (p === '/v1/subscriptions' && init?.method === 'POST') {
      const b = JSON.parse(String(init.body))
      result = {
        id: `sub_${price}`,
        status: 'created',
        short_url: `https://rzp.io/test${price}`,
        ...b,
      }
    } else if (p.endsWith('/cancel')) {
      if (failCancel) return new Response('{}', { status: 502 })
      status = 'active'
      result = { id: `sub_${price}`, status: 'active', cancel_at_cycle_end: 1 }
    } else if (p.startsWith('/v1/subscriptions/'))
      result = {
        id: p.split('/').at(-1),
        plan_id: `plan_${price}`,
        notes: { user_id: 'user' },
        status,
        current_start: start,
        current_end: end,
      }
    else if (p.startsWith('/v1/plans/'))
      result = {
        id: `plan_${price}`,
        period: 'monthly',
        interval: 1,
        item: { amount: price, currency: 'INR' },
      }
    else if (p === '/v1/invoices')
      result = {
        items: [
          {
            id: 'inv_A',
            subscription_id: `sub_${price}`,
            status: 'paid',
            currency: 'INR',
            amount_paid: price,
            payment_id: 'pay_A',
            paid_at: start + 10,
          },
        ],
      }
    else if (p === '/v1/payments/pay_A')
      result = {
        id: 'pay_A',
        invoice_id: 'inv_A',
        status: 'captured',
        captured: true,
        amount: price,
        currency: 'INR',
        amount_refunded: refunded,
      }
    else throw new Error(`Unexpected mock route ${p}`)
    return new Response(JSON.stringify(mutate(p, result)), {
      headers: { 'content-type': 'application/json' },
    })
  }
  const env = configured
    ? {
        RAZORPAY_KEY_ID: 'rzp_test_example',
        RAZORPAY_KEY_SECRET: 'test-secret',
        RAZORPAY_WEBHOOK_SECRET: 'webhook-secret',
      }
    : {}
  const billing = createBilling(db, { env, fetcher, clock: () => time })
  const app = express()
  app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), billing.webhook)
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as any).user = { id: req.get('x-user') ?? 'user' }
    next()
  })
  app.use('/api', billing.router)
  app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.status ?? 500).json({ error: err.message }),
  )
  const webhook = (id: string, event = 'subscription.charged') => {
    const body = JSON.stringify({
      entity: 'event',
      event,
      payload: { subscription: { entity: { id: `sub_${price}` } } },
    })
    return request(app)
      .post('/api/billing/webhook')
      .set('content-type', 'application/json')
      .set('x-razorpay-event-id', id)
      .set(
        'x-razorpay-signature',
        createHmac('sha256', 'webhook-secret').update(body).digest('hex'),
      )
      .send(body)
  }
  return {
    db,
    mutate: (fn: typeof mutate) => {
      mutate = fn
    },
    pauseSubscription: () => {
      let started!: () => void, release!: () => void
      const waiting = new Promise<void>((r) => {
          started = r
        }),
        gate = new Promise<void>((r) => {
          release = r
        })
      beforeFetch = async (path) => {
        if (path === '/v1/subscriptions') {
          started()
          await gate
        }
      }
      return { waiting, release }
    },
    failCancel: () => {
      failCancel = true
    },
    billing,
    app,
    webhook,
    end,
    advance: (ms: number) => {
      time += ms
    },
    refund: () => {
      refunded = price
    },
    get calls() {
      return calls
    },
  }
}
test('only five successful lifetime scans; reserve blocks sixth and failures refund', () => {
  const { billing: b } = setup()
  for (let i = 0; i < 5; i++) {
    b.reserveDiscovery('user', `run${i}`)
    b.settleDiscovery(`run${i}`, true)
  }
  assert.equal(b.summary('user').freeRunsUsed, 5)
  assert.throws(() => b.reserveDiscovery('user', 'six'), /Five free/)
  const { billing: c } = setup()
  c.reserveDiscovery('user', 'failed')
  c.settleDiscovery('failed', false)
  assert.equal(c.summary('user').freeRunsRemaining, 5)
})
test('concurrent reservations cannot overspend; duplicate run never authorizes collection again', async () => {
  const { billing: b } = setup()
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, (_, i) =>
      Promise.resolve().then(() => b.reserveDiscovery('user', `r${i}`)),
    ),
  )
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 5)
  assert.throws(() => b.reserveDiscovery('user', 'r0'), /already reserved/)
  assert.equal(b.summary('user').freeRunsRemaining, 0)
})
test('restart recovery releases in-flight reservations once; completed scans remain charged', () => {
  const { db, billing: b } = setup()
  b.reserveDiscovery('user', 'done')
  b.settleDiscovery('done', true)
  b.reserveDiscovery('user', 'interrupted')
  const restarted = createBilling(db, { env: {} })
  assert.equal(restarted.recoverReservations(), 1)
  assert.equal(restarted.recoverReservations(), 0)
  assert.equal(restarted.summary('user').freeRunsUsed, 1)
  assert.equal(restarted.summary('user').freeRunsRemaining, 4)
})
test('unconfigured and live credentials cannot make provider calls', async () => {
  const s = setup()
  assert.equal((await request(s.app).post('/api/billing/checkout')).status, 503)
  assert.equal(s.calls, 0)
  const live = createBilling(s.db, {
    env: {
      RAZORPAY_KEY_ID: 'rzp_live_example',
      RAZORPAY_KEY_SECRET: 'test',
      RAZORPAY_WEBHOOK_SECRET: 'test',
    },
  })
  assert.equal(live.summary('user').checkoutReady, false)
})
test('ordinary user cannot edit price, complimentary access, block users, or read admin', async () => {
  const { app } = setup()
  for (const [method, path, body] of [
    ['get', '/admin/monetization', {}],
    ['patch', '/admin/monetization', { monthlyPriceInr: 1 }],
    ['put', '/admin/complimentary/user', { enabled: true }],
    ['patch', '/admin/users/admin/access', { blocked: true }],
  ] as const) {
    assert.equal((await (request(app) as any)[method](`/api${path}`).send(body)).status, 403)
  }
})
test('blocked overrides complimentary, paid and free-mode; last admin protected', async () => {
  const { app, billing: b } = setup()
  await request(app)
    .put('/api/admin/complimentary/user')
    .set('x-user', 'admin')
    .send({ enabled: true })
  assert.equal(b.summary('user').access, 'complimentary')
  await request(app)
    .patch('/api/admin/users/user/access')
    .set('x-user', 'admin')
    .send({ blocked: true, reason: 'Policy' })
  assert.equal(b.summary('user').canUseAi, false)
  await request(app).patch('/api/admin/monetization').set('x-user', 'admin').send({ mode: 'free' })
  assert.equal(b.summary('user').access, 'blocked')
  assert.equal(b.summary('other').access, 'global_free')
  assert.equal(
    (
      await request(app)
        .patch('/api/admin/users/admin/access')
        .set('x-user', 'admin')
        .send({ blocked: true })
    ).status,
    409,
  )
})
test('signed event grants only reconciled captured payment; forged and duplicated events do not mutate', async () => {
  const s = setup(true)
  await request(s.app).post('/api/billing/checkout')
  assert.equal(s.billing.summary('user').access, 'free')
  assert.equal(
    (
      await request(s.app)
        .post('/api/billing/webhook')
        .set('content-type', 'application/json')
        .set('x-razorpay-event-id', 'forged')
        .set('x-razorpay-signature', '0'.repeat(64))
        .send('{}')
    ).status,
    401,
  )
  assert.equal(s.billing.summary('user').access, 'free')
  assert.equal((await s.webhook('charged')).status, 200)
  assert.equal(s.billing.summary('user').access, 'subscriber')
  const calls = s.calls
  await s.webhook('charged')
  assert.equal(s.calls, calls)
  await s.webhook('old-created', 'subscription.created')
  assert.equal(s.billing.summary('user').access, 'subscriber')
  s.advance(32 * 86400 * 1000)
  assert.equal(s.billing.summary('user').access, 'free')
})
test('refund revokes previous grant and late events cannot resurrect it; cancel retains paid period', async () => {
  const s = setup(true)
  await request(s.app).post('/api/billing/checkout')
  await s.webhook('paid')
  assert.equal((await request(s.app).post('/api/billing/cancel')).status, 200)
  assert.equal(s.billing.summary('user').access, 'subscriber')
  assert.equal(s.billing.summary('user').renewalCancelled, true)
  s.refund()
  await s.webhook('refund')
  assert.equal(s.billing.summary('user').access, 'free')
  await s.webhook('late-paid')
  assert.equal(s.billing.summary('user').access, 'free')
})
test('free mode requires explicit renewal cancellation; prices create new immutable plans', async () => {
  const s = setup(true)
  await request(s.app).post('/api/billing/checkout')
  assert.equal(
    (
      await request(s.app)
        .patch('/api/admin/monetization')
        .set('x-user', 'admin')
        .send({ mode: 'free' })
    ).status,
    409,
  )
  assert.equal(s.billing.settings().mode, 'paid')
  await request(s.app)
    .patch('/api/admin/monetization')
    .set('x-user', 'admin')
    .send({ monthlyPriceInr: 499 })
  const plan = s.db.prepare('SELECT amount FROM billing_subscriptions').get() as any
  assert.equal(plan.amount, 29900)
  assert.equal(s.billing.settings().monthlyPriceInr, 499)
  assert.equal(
    (
      await request(s.app)
        .patch('/api/admin/monetization')
        .set('x-user', 'admin')
        .send({ mode: 'free', cancelRenewals: true })
    ).status,
    200,
  )
  assert.equal(s.billing.settings().mode, 'free')
})
test('blocked owner can cancel renewal without feature access', async () => {
  const s = setup(true)
  await request(s.app).post('/api/billing/checkout')
  await request(s.app)
    .patch('/api/admin/users/user/access')
    .set('x-user', 'admin')
    .send({ blocked: true })
  assert.equal((await request(s.app).post('/api/billing/cancel')).status, 200)
  assert.equal(s.billing.summary('user').access, 'blocked')
})

test('captured payment must match subscription owner, original plan, amount and currency', async () => {
  for (const [path, change] of [
    ['/v1/payments/pay_A', { captured: false }],
    ['/v1/payments/pay_A', { amount: 1 }],
    ['/v1/payments/pay_A', { currency: 'USD' }],
    ['/v1/payments/pay_A', { invoice_id: 'inv_foreign' }],
    ['/v1/subscriptions/sub_29900', { notes: { user_id: 'other' } }],
    ['/v1/plans/plan_29900', { item: { amount: 1, currency: 'INR' } }],
  ] as [string, Record<string, unknown>][]) {
    const s = setup(true)
    await request(s.app).post('/api/billing/checkout')
    s.mutate((p, v) => (p === path ? { ...v, ...change } : v))
    await s.webhook('tampered')
    assert.equal(s.billing.summary('user').access, 'free', path + JSON.stringify(change))
  }
})
test('provider cancellation failure leaves paid mode and an audit record', async () => {
  const s = setup(true)
  await request(s.app).post('/api/billing/checkout')
  s.failCancel()
  assert.equal(
    (
      await request(s.app)
        .patch('/api/admin/monetization')
        .set('x-user', 'admin')
        .send({ mode: 'free', cancelRenewals: true })
    ).status,
    502,
  )
  assert.equal(s.billing.settings().mode, 'paid')
  assert.ok(s.billing.adminSummary().audit.some((e) => e.action === 'free_mode_failed'))
})
test('changing admin price does not alter existing paid agreement validation', async () => {
  const s = setup(true)
  await request(s.app).post('/api/billing/checkout')
  await request(s.app)
    .patch('/api/admin/monetization')
    .set('x-user', 'admin')
    .send({ monthlyPriceInr: 999 })
  assert.equal((await s.webhook('old-plan-paid')).status, 200)
  assert.equal(s.billing.summary('user').access, 'subscriber')
  assert.equal(s.billing.summary('user').monthlyPriceInr, 999)
})
test('interrupted checkout cannot issue duplicate provider subscriptions after restart', async () => {
  const s = setup(true)
  s.db
    .prepare('INSERT INTO billing_checkout_attempts VALUES(?,?,?)')
    .run('user', 'creating', new Date().toISOString())
  const result = await request(s.app).post('/api/billing/checkout')
  assert.equal(result.status, 409)
  assert.equal(result.body.code, 'CHECKOUT_PENDING_RECONCILIATION')
  assert.equal(
    Number((s.db.prepare('SELECT COUNT(*) n FROM billing_subscriptions').get() as any).n),
    0,
  )
})

test('unconfirmed active cancellation cannot enable global free or mark renewal cancelled', async () => {
  const s = setup(true)
  await request(s.app).post('/api/billing/checkout')
  s.mutate((p, v) => (p.endsWith('/cancel') ? { ...v, cancel_at_cycle_end: 0 } : v))
  const result = await request(s.app)
    .patch('/api/admin/monetization')
    .set('x-user', 'admin')
    .send({ mode: 'free', cancelRenewals: true })
  assert.equal(result.status, 502)
  assert.equal(s.billing.settings().mode, 'paid')
  assert.equal(s.billing.summary('user').renewalCancelled, false)
  assert.equal(s.billing.adminSummary().activeSubscriptions, 1)
})
test('follow-up provider snapshot can confirm scheduled cancellation', async () => {
  const s = setup(true)
  await request(s.app).post('/api/billing/checkout')
  s.mutate((p, v) =>
    p.endsWith('/cancel')
      ? { ...v, cancel_at_cycle_end: 0 }
      : p.startsWith('/v1/subscriptions/sub_')
        ? { ...v, cancel_at_cycle_end: true }
        : v,
  )
  assert.equal((await request(s.app).post('/api/billing/cancel')).status, 200)
  assert.equal(s.billing.summary('user').renewalCancelled, true)
})
test('blocking with cancellation during in-flight checkout cancels newly created renewal', async () => {
  const s = setup(true),
    pause = s.pauseSubscription()
  const checkout = request(s.app)
    .post('/api/billing/checkout')
    .then((r) => r)
  await pause.waiting
  const blocking = request(s.app)
    .patch('/api/admin/users/user/access')
    .set('x-user', 'admin')
    .send({ blocked: true, cancelRenewal: true })
    .then((r) => r)
  for (let i = 0; i < 100 && !s.billing.summary('user').blocked; i++)
    await new Promise<void>((r) => setImmediate(r))
  assert.equal(s.billing.summary('user').blocked, true)
  pause.release()
  const [c, b] = await Promise.all([checkout, blocking])
  assert.equal(c.status, 403)
  assert.equal(b.status, 200)
  assert.equal(b.body.cancellationStatus, 'cancelled')
  assert.equal(s.billing.adminSummary().activeSubscriptions, 0)
  assert.equal(s.billing.summary('user').renewalCancelled, true)
})
