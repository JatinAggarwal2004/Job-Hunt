import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createHmac } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { createApp } from './app.ts'
import { createIntelligence } from './intelligence.ts'
import { runtimeConfig } from './config.ts'
import { acquireWorkerLease } from './lease.ts'
import { analyze } from './resume.ts'
import type { Settings, Profile } from '../shared/types.ts'
const fake = (async () => new Response(JSON.stringify({ data: [] }))) as typeof fetch
const account = (name: string) => ({
  name,
  email: `${name}@example.test`,
  password: 'Test only strong password 9274',
})
test('production admin bootstrap, verification, secure sessions and one-use password recovery', async () => {
  const sent: { to: string; subject: string; text: string }[] = []
  const env = {
    NODE_ENV: 'production',
    APP_ORIGIN: 'https://jobs.example.test',
    BOOTSTRAP_ADMIN_EMAIL: 'owner@example.test',
  }
  const b = createApp({
    dbPath: ':memory:',
    worker: false,
    env,
    sendMail: async (mail) => {
      sent.push(mail)
    },
  })
  const host = { Host: 'jobs.example.test', Origin: 'https://jobs.example.test' }
  try {
    const first = await request(b.app).post('/api/auth/register').set(host).send(account('visitor'))
    assert.equal(first.status, 201)
    assert.equal(first.body.user.role, 'user')
    assert.match(first.headers['set-cookie'][0], /Secure/)
    const owner = await request(b.app).post('/api/auth/register').set(host).send(account('owner'))
    assert.equal(owner.status, 201)
    const cookie = owner.headers['set-cookie'][0].split(';')[0]
    assert.equal(
      (await request(b.app).get('/api/admin').set(host).set('Cookie', cookie)).status,
      403,
    )
    const verification = sent.find(
      (m) => m.to === 'owner@example.test' && m.subject.includes('Verify'),
    )!
    assert.ok(verification)
    const token = new URL(verification.text.match(/https:\/\/\S+/)![0]).searchParams.get('verify')!
    assert.equal(
      (await request(b.app).post('/api/auth/verify').set(host).send({ token })).status,
      200,
    )
    assert.equal(
      (await request(b.app).post('/api/auth/verify').set(host).send({ token })).status,
      400,
    )
    assert.equal(
      (await request(b.app).get('/api/admin').set(host).set('Cookie', cookie)).status,
      200,
    )
    assert.equal(
      (
        await request(b.app)
          .get('/api/bootstrap')
          .set({ ...host, Origin: 'https://evil.example' })
          .set('Cookie', cookie)
      ).status,
      403,
    )
    const ready = await request(b.app).get('/api/ready').set(host)
    assert.equal(ready.status, 503)
    assert.ok(ready.body.missing.includes('payment_gateway'))
    assert.match(ready.headers['content-security-policy'], /frame-ancestors 'none'/)
    const known = await request(b.app)
        .post('/api/auth/request-reset')
        .set(host)
        .send({ email: 'owner@example.test' }),
      unknown = await request(b.app)
        .post('/api/auth/request-reset')
        .set(host)
        .send({ email: 'unknown@example.test' })
    assert.equal(known.status, 202)
    assert.deepEqual(known.body, unknown.body)
    const reset = sent.find((m) => m.subject.includes('Reset'))!
    const resetToken = new URL(reset.text.match(/https:\/\/\S+/)![0]).searchParams.get('reset')!
    assert.equal(
      (
        await request(b.app)
          .post('/api/auth/reset')
          .set(host)
          .send({ token: resetToken, password: 'Replacement test password 1234' })
      ).status,
      200,
    )
    assert.equal(
      (await request(b.app).get('/api/bootstrap').set(host).set('Cookie', cookie)).status,
      401,
    )
    assert.equal(
      (
        await request(b.app)
          .post('/api/auth/reset')
          .set(host)
          .send({ token: resetToken, password: 'Another test password 1234' })
      ).status,
      400,
    )
    assert.equal(
      (
        await request(b.app)
          .post('/api/auth/login')
          .set(host)
          .send({ email: 'owner@example.test', password: 'Replacement test password 1234' })
      ).status,
      200,
    )
  } finally {
    await b.close()
  }
})
test('production config fails closed; missing mail prevents registration; exact host required', async () => {
  assert.throws(
    () => runtimeConfig({ NODE_ENV: 'production', APP_ORIGIN: 'http://example.test' }),
    /HTTPS/,
  )
  assert.throws(
    () => runtimeConfig({ NODE_ENV: 'production', APP_ORIGIN: 'https://example.test' }),
    /BOOTSTRAP/,
  )
  const b = createApp({
    dbPath: ':memory:',
    worker: false,
    env: {
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://example.test',
      BOOTSTRAP_ADMIN_EMAIL: 'owner@example.test',
    },
  })
  try {
    assert.equal(
      (
        await request(b.app)
          .post('/api/auth/register')
          .set('Host', 'example.test')
          .send(account('visitor'))
      ).status,
      503,
    )
    assert.equal((await request(b.app).get('/api/profile').set('Host', 'evil.test')).status, 403)
  } finally {
    await b.close()
  }
})
test('integrated trial, premium controls, complimentary ID, block and free mode enforce server access', async () => {
  const b = createApp({ dbPath: ':memory:', worker: false, fetcher: fake })
  try {
    const admin = request.agent(b.app),
      user = request.agent(b.app)
    await admin.post('/api/auth/register').send(account('admin'))
    const u = (await user.post('/api/auth/register').send(account('member'))).body.user
    for (let i = 0; i < 5; i++) {
      assert.equal((await user.post('/api/discovery/run')).status, 202)
      await b.settle()
    }
    assert.equal((await user.post('/api/discovery/run')).status, 402)
    assert.equal((await user.get('/api/billing')).body.entitlements.freeRunsRemaining, 0)
    assert.equal((await user.post('/api/extension/token')).status, 402)
    assert.equal(
      (await admin.put(`/api/admin/complimentary/${u.id}`).send({ enabled: true })).status,
      200,
    )
    assert.equal((await user.get('/api/bootstrap')).body.entitlements.access, 'complimentary')
    const token = (await user.post('/api/extension/token')).body.token
    assert.ok(token)
    assert.equal(
      (
        await admin
          .patch(`/api/admin/users/${u.id}/access`)
          .send({ blocked: true, reason: 'Review required' })
      ).status,
      200,
    )
    assert.equal((await user.get('/api/jobs')).status, 403)
    assert.equal(
      (await request(b.app).get('/api/extension/profile').set('Authorization', `Bearer ${token}`))
        .status,
      403,
    )
    assert.equal((await user.get('/api/billing')).status, 200)
    await admin.patch('/api/admin/monetization').send({ mode: 'free' })
    assert.equal((await user.get('/api/bootstrap')).body.entitlements.access, 'blocked')
    await admin.patch(`/api/admin/users/${u.id}/access`).send({ blocked: false })
    assert.equal((await user.get('/api/bootstrap')).body.entitlements.access, 'global_free')
    assert.equal((await user.post('/api/discovery/run')).status, 202)
    await b.settle()
  } finally {
    await b.close()
  }
})
test('raw Razorpay webhook is outside cookie auth and rejects forged signatures', async () => {
  const env = {
    RAZORPAY_KEY_ID: 'rzp_test_fixture',
    RAZORPAY_KEY_SECRET: 'test_only_fixture_key',
    RAZORPAY_WEBHOOK_SECRET: 'test_only_fixture_webhook',
  }
  const b = createApp({ dbPath: ':memory:', worker: false, env })
  try {
    const raw = JSON.stringify({ entity: 'event', event: 'irrelevant.test', payload: {} })
    assert.equal(
      (
        await request(b.app)
          .post('/api/billing/webhook')
          .set('Content-Type', 'application/json')
          .set('x-razorpay-signature', 'bad')
          .send(raw)
      ).status,
      401,
    )
    const signature = createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex')
    assert.equal(
      (
        await request(b.app)
          .post('/api/billing/webhook')
          .set('Content-Type', 'application/json')
          .set('x-razorpay-signature', signature)
          .set('x-razorpay-event-id', 'evt_fixture_1')
          .send(raw)
      ).status,
      200,
    )
  } finally {
    await b.close()
  }
})
test('hosted AI requires explicit configuration and consent; validated drafts and daily caps', async () => {
  const db = new DatabaseSync(':memory:')
  const text = 'Experience\nBuilt an accessible dashboard for the team.'
  const baseline = analyze(text, { skills: [] } as unknown as Profile),
    settings = {
      aiEnabled: true,
      aiProvider: 'gemini',
      aiModel: 'gemini-test',
      aiDailyLimit: 1,
    } as Settings
  let calls = 0
  const fetcher = (async (url: any, init: any) => {
    calls++
    assert.match(String(url), /^https:\/\/generativelanguage.googleapis.com/)
    assert.equal(init.headers['x-goog-api-key'], 'test_key_not_real')
    assert.ok(!String(url).includes('test_key'))
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    suggestions: [
                      {
                        title: 'Clarity',
                        detail: 'Verify wording',
                        before: 'an accessible dashboard',
                        after: 'an accessible web dashboard',
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    )
  }) as typeof fetch
  try {
    const off = createIntelligence(db, { fetcher, env: {} })
    await assert.rejects(
      () => off.run('u', baseline, text, settings, { consent: true }),
      /not been enabled/,
    )
    assert.equal(calls, 0)
    const ai = createIntelligence(db, {
      fetcher,
      env: {
        ENABLE_HOSTED_AI: 'true',
        AI_GEMINI_API_KEY: 'test_key_not_real',
        AI_GEMINI_MODEL: 'gemini-test',
      },
    })
    await assert.rejects(() => ai.run('u', baseline, text, settings), /consent/)
    assert.equal(calls, 0)
    const result = await ai.run('u', baseline, text, settings, { consent: true })
    assert.equal(result.engine, 'gemini')
    assert.equal(result.suggestions.filter((s) => s.category === 'Gemini AI').length, 1)
    await assert.rejects(
      () => ai.run('u', baseline, text, settings, { consent: true }),
      /Daily AI limit/,
    )
    assert.equal(calls, 1)
  } finally {
    db.close()
  }
})
test('single instance worker lease prevents overlapping scheduler ownership and permits clean handover', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const first = acquireWorkerLease(db)
    assert.equal(first.valid(), true)
    assert.throws(() => acquireWorkerLease(db), /Another API/)
    first.release()
    const next = acquireWorkerLease(db)
    assert.equal(next.valid(), true)
    next.release()
  } finally {
    db.close()
  }
})

test('Render Free fails closed before opening an ephemeral SQLite database', () => {
  assert.throws(
    () =>
      runtimeConfig({
        NODE_ENV: 'production',
        RENDER: 'true',
        RENDER_EXTERNAL_URL: 'https://job-hunter-test.onrender.com',
        BOOTSTRAP_ADMIN_EMAIL: 'owner@example.test',
      }),
    /cannot run on Render Free/,
  )
})

test('Railway cannot expose development authentication defaults', () => {
  for (const NODE_ENV of [undefined, 'development', 'test'])
    assert.throws(
      () => runtimeConfig({ RAILWAY_ENVIRONMENT_ID: 'fixture', NODE_ENV }),
      /must set NODE_ENV=production/,
    )
})
