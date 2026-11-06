import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import request from 'supertest'
import { publicJobInput } from './rag-privacy.ts'
import { createGroundedGeneration } from './grounded-ai.ts'
import { createIntelligence } from './intelligence.ts'
import { createApp } from './app.ts'
import type { GroundedResponse } from '../shared/matching.ts'
import type { Analysis, Settings } from '../shared/types.ts'
const context: GroundedResponse = {
  answer: 'Source excerpt',
  engine: 'retrieval',
  notice: '',
  evidence: [
    {
      id: 'S1',
      jobId: 'job',
      title: 'Backend Engineer',
      url: 'https://employer.example/jobs/1',
      quote:
        'Required Java and SQL. Contact recruitment@example.test or +91 9876543210. Apply at https://employer.example/contact.',
    },
  ],
}
const settings = {
  aiEnabled: true,
  aiProvider: 'gemini',
  aiModel: 'fixture-model',
  aiDailyLimit: 20,
} as Settings
const env = {
  ENABLE_HOSTED_AI: 'true',
  AI_GEMINI_API_KEY: 'fixture-not-a-real-key',
  AI_GEMINI_MODEL: 'fixture-model',
  AI_GEMINI_PUBLIC_JOBS_ONLY: 'true',
  RAG_DAILY_SHARED_LIMIT: '2',
}
const answer = (text = 'The job requires Java and SQL. [S1]', citations = ['S1']) =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: text, citations }) }] } }],
    }),
    { headers: { 'content-type': 'application/json' } },
  )
const database = () => {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE ai_usage(user_id TEXT,day TEXT,attempts INTEGER,PRIMARY KEY(user_id,day))')
  return db
}
test('public-job generation excludes contact/URL payloads and rejects personal questions before inference', () => {
  for (const q of [
    'email me at person@example.test',
    'Call +91 9876543210',
    'Compare my resume',
    'My passport is ABC123',
  ])
    assert.throws(() => publicJobInput(q, context), /personal details/)
  const wire = JSON.stringify(publicJobInput('Which jobs require Java?', context))
  assert.ok(!wire.includes('recruitment@example.test'))
  assert.ok(!wire.includes('9876543210'))
  assert.ok(!wire.includes('https://'))
  assert.ok(!wire.includes('jobId'))
  assert.ok(wire.includes('Java and SQL'))
})
test('generation uses a structured source enum, validates inline citations and limits context to six excerpts', async () => {
  const db = database()
  let body: any
  const run = createGroundedGeneration(db, { ...env, RAG_DAILY_SHARED_LIMIT: '10' }, (async (
    _u: any,
    o: any,
  ) => {
    body = JSON.parse(o.body)
    return answer('A supported answer. [S99]')
  }) as typeof fetch)
  try {
    await assert.rejects(() => run('u', 'Which Java jobs?', context, settings, false), /Consent/)
    await assert.rejects(
      () => run('u', 'Which Java jobs?', context, settings, true),
      /usable cited/,
    )
    assert.deepEqual(
      body.generationConfig.responseFormat.text.schema.properties.citations.items.enum,
      ['S1'],
    )
    assert.ok(!JSON.stringify(body).includes('recruitment@example.test'))
    assert.equal(body.generationConfig.temperature, undefined)
    assert.equal(body.generationConfig.responseFormat.text.mimeType, 'APPLICATION_JSON')
    const extra = {
      ...context,
      evidence: Array.from({ length: 8 }, (_, i) => ({
        ...context.evidence[0],
        id: 'S' + (i + 1),
      })),
    }
    const seven = createGroundedGeneration(
      db,
      { ...env, RAG_DAILY_SHARED_LIMIT: '10' },
      (async () => answer('Unsent source.', ['S7'])) as typeof fetch,
    )
    await assert.rejects(() => seven('v', 'Java?', extra, settings, true), /usable cited/)
  } finally {
    db.close()
  }
})
test('shared daily reservations span accounts and adapter instances, while empty evidence makes no call', async () => {
  const db = database()
  let calls = 0
  const fetcher = (async () => {
    calls++
    return answer()
  }) as typeof fetch
  try {
    const one = createGroundedGeneration(db, env, fetcher),
      two = createGroundedGeneration(db, env, fetcher)
    assert.equal((await one('a', 'Java?', context, settings, true)).engine, 'gemini')
    await two('b', 'Java?', context, settings, true)
    await assert.rejects(() => one('c', 'Java?', context, settings, true), /Shared daily/)
    assert.equal(calls, 2)
    assert.equal(
      (await one('c', 'Nothing?', { ...context, evidence: [] }, settings, true)).engine,
      'retrieval',
    )
    assert.equal(calls, 2)
  } finally {
    db.close()
  }
})
test('free public-job mode exposes RAG availability but never sends resume text to hosted inference', async () => {
  const db = database()
  let calls = 0
  const intelligence = createIntelligence(db, {
    env,
    fetcher: (async () => {
      calls++
      return answer()
    }) as typeof fetch,
  })
  try {
    const status = await intelligence.status(settings)
    assert.equal(status.available, false)
    assert.equal(status.ragAvailable, true)
    assert.equal(status.publicJobsOnly, true)
    await assert.rejects(
      () =>
        intelligence.run('a', {} as Analysis, 'Private resume text', settings, { consent: true }),
      /only public job questions/,
    )
    assert.equal(calls, 0)
  } finally {
    db.close()
  }
})
test('authenticated RAG generates from owned matches and retains source evidence on quota/provider failure', async () => {
  let calls = 0
  let unavailable = false
  const backend = createApp({
    dbPath: ':memory:',
    worker: false,
    env: { ...env, ENABLE_SEMANTIC_MODEL: 'false' },
    fetcher: (async () => {
      calls++
      return unavailable ? new Response('', { status: 429 }) : answer()
    }) as typeof fetch,
  })
  try {
    const a = request.agent(backend.app),
      b = request.agent(backend.app)
    for (const [agent, email] of [
      [a, 'rag-a@example.test'],
      [b, 'rag-b@example.test'],
    ] as const)
      await agent
        .post('/api/auth/register')
        .send({ name: 'Fixture', email, password: 'Fixture only passphrase 2026!' })
    const boot = (await a.get('/api/bootstrap')).body
    assert.equal(
      (await a.patch('/api/admin/settings').send({ ...boot.settings, ...settings })).status,
      200,
    )
    const profile = (await a.get('/api/profile')).body
    await a
      .put('/api/profile')
      .send({ ...profile, roles: ['Software Engineer'], locations: ['India'] })
    const source = JSON.parse(
      (backend.db.prepare('SELECT data FROM sources LIMIT 1').get() as any).data,
    )
    const job = {
      id: 'job',
      title: 'Software Engineer',
      company: 'Fixture Employer',
      location: 'India',
      remote: false,
      url: 'https://employer.example/jobs/1',
      description: 'Required Java and SQL.',
      source: source.id,
      postedAt: null,
      fetchedAt: new Date().toISOString(),
      salaryMin: null,
      salaryMax: null,
      currency: null,
      companySize: null,
    }
    backend.db.prepare('INSERT INTO jobs VALUES(?,?)').run(job.id, JSON.stringify(job))
    backend.db.prepare('INSERT INTO discovered_jobs VALUES(?,?)').run(boot.user.id, job.id)
    backend.retrieval.index(job)
    const payload = { question: 'Which jobs require Java?', useAi: true, consent: true }
    const generated = await a.post('/api/assistant/query').send(payload)
    assert.equal(generated.status, 200)
    assert.equal(generated.body.engine, 'gemini')
    assert.match(generated.body.answer, /\[S1\]/)
    assert.equal(
      (await b.post('/api/assistant/query').send({ ...payload, jobId: 'job' })).status,
      404,
    )
    unavailable = true
    const fallback = await a.post('/api/assistant/query').send(payload)
    assert.equal(fallback.status, 200)
    assert.equal(fallback.body.engine, 'retrieval')
    assert.equal(fallback.body.evidence[0].jobId, 'job')
    assert.match(fallback.body.notice, /Showing retrieved source excerpts/)
    const personal = await a
      .post('/api/assistant/query')
      .send({ ...payload, question: 'Java jobs for me at person@example.test' })
    assert.equal(personal.status, 400)
    assert.equal(calls, 2)
    const status = (await a.get('/api/ai/status')).body
    assert.equal(status.ragAvailable, true)
    assert.equal(status.available, false)
  } finally {
    await backend.close()
  }
})
