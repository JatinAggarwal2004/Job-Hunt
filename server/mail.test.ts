import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp } from './app.ts'
import { httpsMailSender } from './mail.ts'

const env = {
  NODE_ENV: 'production',
  APP_ORIGIN: 'https://jobs.example.test',
  BOOTSTRAP_ADMIN_EMAIL: 'owner@example.test',
  MAIL_PROVIDER: 'brevo',
  BREVO_API_KEY: 'fixture_not_a_real_key',
  MAIL_FROM_EMAIL: 'sender@example.test',
}
const headers = { Host: 'jobs.example.test', Origin: 'https://jobs.example.test' }
const owner = { name: 'Owner', email: 'owner@example.test', password: 'Test only password 92847' }

test('HTTPS email sends one verification to the intended user and enables only verified admin access', async () => {
  let calls = 0,
    text = ''
  const mailFetcher = (async (url, init) => {
    calls++
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email')
    assert.equal(init?.redirect, 'error')
    assert.ok(init?.signal)
    assert.equal((init?.headers as Record<string, string>)['api-key'], env.BREVO_API_KEY)
    const body = JSON.parse(String(init?.body))
    assert.deepEqual(body.to, [{ email: owner.email }])
    assert.equal(body.sender.email, env.MAIL_FROM_EMAIL)
    assert.equal(body.subject, 'Verify your Job-Hunter email')
    assert.ok(!String(init?.body).includes(env.BREVO_API_KEY))
    text = body.textContent
    return new Response(JSON.stringify({ messageId: 'fixture' }), { status: 201 })
  }) as typeof fetch
  const b = createApp({ dbPath: ':memory:', env, worker: false, mailFetcher })
  try {
    const created = await request(b.app).post('/api/auth/register').set(headers).send(owner)
    assert.equal(created.status, 201)
    assert.equal(calls, 1)
    const cookie = created.headers['set-cookie'][0].split(';')[0]
    assert.equal(
      (await request(b.app).get('/api/admin').set(headers).set('Cookie', cookie)).status,
      403,
    )
    const link = new URL(text.match(/https:\/\/\S+/)![0])
    assert.equal(link.origin, env.APP_ORIGIN)
    assert.equal(
      (
        await request(b.app)
          .post('/api/auth/verify')
          .set(headers)
          .send({ token: link.searchParams.get('verify') })
      ).status,
      200,
    )
    assert.equal(
      (await request(b.app).get('/api/admin').set(headers).set('Cookie', cookie)).status,
      200,
    )
  } finally {
    await b.close()
  }
})

test('incomplete or unknown HTTPS email configuration leaves signup closed without calls', async () => {
  for (const config of [
    { ...env, BREVO_API_KEY: '' },
    { ...env, MAIL_FROM_EMAIL: 'bad' },
    { ...env, MAIL_PROVIDER: 'unknown' },
  ]) {
    const b = createApp({
      dbPath: ':memory:',
      env: config,
      worker: false,
      mailFetcher: (async () => {
        throw Error('Must not call')
      }) as typeof fetch,
    })
    try {
      assert.equal(httpsMailSender(config), null)
      assert.equal(
        (await request(b.app).post('/api/auth/register').set(headers).send(owner)).status,
        503,
      )
      assert.equal(b.db.prepare('SELECT count(*) AS n FROM users').get()?.n, 0)
    } finally {
      await b.close()
    }
  }
})

test('provider refusal or network failure cannot verify a user or retain a usable token', async () => {
  for (const status of [401, 429, 302, 0]) {
    const b = createApp({
      dbPath: ':memory:',
      env,
      worker: false,
      mailFetcher: (async () => {
        if (!status) throw Error('Network failure including fixture secret')
        return new Response('provider details must remain private', { status })
      }) as typeof fetch,
    })
    try {
      const created = await request(b.app).post('/api/auth/register').set(headers).send(owner)
      assert.equal(created.status, 201)
      assert.match(created.body.verificationMessage, /could not be sent/)
      assert.ok(!JSON.stringify(created.body).includes('provider details'))
      assert.equal(b.db.prepare('SELECT count(*) AS n FROM account_tokens').get()?.n, 0)
      const cookie = created.headers['set-cookie'][0].split(';')[0]
      assert.equal(
        (await request(b.app).get('/api/admin').set(headers).set('Cookie', cookie)).status,
        403,
      )
    } finally {
      await b.close()
    }
  }
})
