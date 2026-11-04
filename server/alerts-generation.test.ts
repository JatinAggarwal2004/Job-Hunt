import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp } from './app.ts'
import { createGroundedGeneration } from './grounded-ai.ts'
import { DatabaseSync } from 'node:sqlite'
import type { Job, Settings } from '../shared/types.ts'
import type { GroundedResponse } from '../shared/matching.ts'
async function prepared(sendMail: (mail: any) => Promise<void>) {
  const b = createApp({
    dbPath: ':memory:',
    worker: false,
    env: { ENABLE_SEMANTIC_MODEL: 'false' },
    sendMail,
  })
  const a = request.agent(b.app)
  await a.post('/api/auth/register').send({
    name: 'Alert Fixture',
    email: 'alerts@example.test',
    password: 'Fixture only passphrase 2026!',
  })
  const user = (await a.get('/api/bootstrap')).body.user
  b.db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(user.id)
  const source = JSON.parse((b.db.prepare('SELECT data FROM sources LIMIT 1').get() as any).data)
  const j = {
    id: 'alert-job',
    title: 'Backend Engineer',
    company: 'Fixture',
    url: 'https://employer.example/jobs/alert',
    description: 'Java backend work',
    source: source.id,
    location: 'India',
    remote: false,
    fetchedAt: new Date().toISOString(),
    postedAt: null,
    salaryMin: null,
    salaryMax: null,
    currency: null,
    companySize: null,
  } as Job
  b.db.prepare('INSERT INTO jobs VALUES(?,?)').run(j.id, JSON.stringify(j))
  b.db.prepare('INSERT INTO discovered_jobs VALUES(?,?)').run(user.id, j.id)
  return { b, a, user, j }
}
test('opt-in email reminders deliver once, include provenance and are not sent to blocked or unverified accounts', async () => {
  const sent: any[] = []
  const { b, a, user, j } = await prepared(async (mail) => {
    sent.push(mail)
  })
  try {
    sent.length = 0
    const body = {
      jobId: j.id,
      deadlineAt: new Date(Date.now() + 86400000).toISOString(),
      remindAt: new Date(Date.now() - 1000).toISOString(),
      emailEnabled: true,
    }
    assert.equal((await a.post('/api/alerts').send(body)).status, 200)
    await b.alerts.tick()
    await b.alerts.tick()
    assert.equal(sent.length, 1)
    assert.equal(sent[0].to, 'alerts@example.test')
    assert.ok(sent[0].text.includes('You entered this deadline'))
    assert.ok((await a.get('/api/alerts')).body.alerts[0].sentAt)
    await a
      .post('/api/alerts')
      .send({ ...body, remindAt: new Date(Date.now() - 2000).toISOString() })
    b.db
      .prepare('INSERT INTO billing_access(user_id,blocked,reason) VALUES(?,1,?)')
      .run(user.id, 'fixture')
    await b.alerts.tick()
    assert.equal(sent.length, 1)
    assert.equal(b.db.prepare('SELECT email_enabled FROM job_alerts').get()?.email_enabled, 0)
  } finally {
    await b.close()
  }
})
test('failed email delivery is retried at most3times and in-app reminder remains available', async () => {
  let attempts = 0
  let fail = false
  const { b, a, j } = await prepared(async () => {
    if (fail) {
      attempts++
      throw Error('simulated provider unavailable')
    }
  })
  try {
    fail = true
    const now = Date.now()
    await a.post('/api/alerts').send({
      jobId: j.id,
      deadlineAt: new Date(now + 86400000).toISOString(),
      remindAt: new Date(now - 1000).toISOString(),
      emailEnabled: true,
    })
    for (let i = 0; i < 5; i++) await b.alerts.tick(new Date(now + i * 301000))
    assert.equal(attempts, 3)
    const alerts = (await a.get('/api/alerts')).body.alerts
    assert.equal(alerts.length, 1)
    assert.ok(alerts[0].error.includes('in-app'))
    assert.equal(alerts[0].sentAt, null)
  } finally {
    await b.close()
  }
})
test('deadline reminders persist across database reopen and free-host catch-up can deliver later', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs'),
    { tmpdir } = await import('node:os'),
    { join } = await import('node:path')
  const dir = mkdtempSync(join(tmpdir(), 'job-alert-restart-'))
  const path = join(dir, 'fixture.sqlite')
  const mail: any[] = []
  let backend = createApp({
    dbPath: path,
    worker: false,
    env: { ENABLE_SEMANTIC_MODEL: 'false' },
    sendMail: async (m) => {
      mail.push(m)
    },
  })
  try {
    const agent = request.agent(backend.app)
    await agent.post('/api/auth/register').send({
      name: 'Restart',
      email: 'restart@example.test',
      password: 'Fixture only passphrase 2026!',
    })
    const user = (await agent.get('/api/bootstrap')).body.user
    backend.db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(user.id)
    const job = {
      id: 'restart-job',
      title: 'Engineer',
      description: 'Build reliable services.',
      company: 'Fixture',
      url: 'https://employer.example/jobs/restart',
    } as Job
    backend.db.prepare('INSERT INTO jobs VALUES(?,?)').run(job.id, JSON.stringify(job))
    const when = Date.now() + 1000
    backend.alerts.save(
      user.id,
      job,
      new Date(when + 86400000).toISOString(),
      new Date(when).toISOString(),
      true,
    )
    await backend.close()
    backend = createApp({
      dbPath: path,
      worker: false,
      env: { ENABLE_SEMANTIC_MODEL: 'false' },
      sendMail: async (m) => {
        mail.push(m)
      },
    })
    mail.length = 0
    await backend.alerts.tick(new Date(when + 30000))
    assert.equal(mail.length, 1)
    assert.equal(backend.alerts.list(user.id).length, 1)
  } finally {
    await backend.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
test('grounded generation requires consent, rejects unknown citations and sends only supplied source context', async () => {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE ai_usage(user_id TEXT,day TEXT,attempts INTEGER,PRIMARY KEY(user_id,day))')
  let calls = 0,
    wire = ''
  let valid = true
  const run = createGroundedGeneration(
    db,
    {
      ENABLE_HOSTED_AI: 'true',
      AI_GEMINI_API_KEY: 'fixture-not-a-real-key',
      AI_GEMINI_MODEL: 'fixture-model',
    },
    (async (_url: any, opts: any) => {
      calls++
      wire = opts.body
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      answer: 'This job mentions Java.',
                      citations: [valid ? 'S1' : 'FOREIGN'],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch,
  )
  const context: GroundedResponse = {
    answer: 'retrieved',
    engine: 'retrieval',
    evidence: [
      {
        id: 'S1',
        jobId: 'j',
        title: 'Backend',
        url: 'https://employer.example/j',
        quote: 'Required Java experience.',
      },
    ],
    notice: '',
  }
  const settings = {
    aiEnabled: true,
    aiProvider: 'gemini',
    aiModel: 'fixture-model',
    aiDailyLimit: 5,
  } as Settings
  try {
    await assert.rejects(() => run('u', 'Java?', context, settings, false), /Consent/)
    assert.equal(calls, 0)
    const result = await run('u', 'Java?', context, settings, true)
    assert.equal(result.engine, 'gemini')
    assert.equal(result.evidence[0].jobId, 'j')
    assert.ok(!wire.includes('resume'))
    valid = false
    await assert.rejects(() => run('u', 'Java?', context, settings, true), /usable cited/)
    assert.equal(calls, 2)
  } finally {
    db.close()
  }
})
