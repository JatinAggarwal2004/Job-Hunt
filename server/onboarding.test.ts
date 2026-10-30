import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp } from './app.ts'
const draft = {
  step: 2,
  roles: ['Backend Engineer'],
  locations: ['India', 'Hyderabad'],
  experienceLevels: ['Internship', 'Entry level'],
  remoteOnly: false,
  resumeId: null,
}
async function account(backend: ReturnType<typeof createApp>, email: string) {
  const agent = request.agent(backend.app)
  assert.equal(
    (
      await agent
        .post('/api/auth/register')
        .send({ name: 'Setup QA', email, password: 'Fixture only passphrase 2026!' })
    ).status,
    201,
  )
  return agent
}
test('setup starts empty, saves private progress and completion merges preferences without a scan', async () => {
  let calls = 0
  const backend = createApp({
    dbPath: ':memory:',
    worker: false,
    fetcher: (async () => {
      calls++
      throw Error('No setup provider calls')
    }) as typeof fetch,
  })
  try {
    const a = await account(backend, 'setup@example.test')
    const initial = (await a.get('/api/bootstrap')).body
    assert.equal(initial.onboarding.completed, false)
    assert.equal(initial.overview.jobs, 0)
    assert.equal((await a.post('/api/onboarding/complete')).status, 400)
    const p = (await a.get('/api/profile')).body
    await a.put('/api/profile').send({
      ...p,
      salaryMin: 700000,
      phone: 'fixture',
      skills: ['Java'],
      companySizes: ['small'],
    })
    assert.equal((await a.put('/api/onboarding').send(draft)).status, 200)
    assert.deepEqual((await a.get('/api/onboarding')).body.locations, ['India', 'Hyderabad'])
    assert.deepEqual((await a.get('/api/profile')).body.roles, [])
    assert.equal((await a.post('/api/onboarding/complete')).status, 200)
    const after = (await a.get('/api/bootstrap')).body
    assert.equal(after.onboarding.completed, true)
    assert.equal(after.profile.salaryMin, 700000)
    assert.equal(after.profile.phone, 'fixture')
    assert.deepEqual(after.profile.skills, ['Java'])
    assert.deepEqual(after.profile.roles, draft.roles)
    assert.deepEqual(after.profile.experienceLevels, draft.experienceLevels)
    assert.equal(after.overview.lastRun, null)
    assert.equal(after.entitlements.freeRunsRemaining, 5)
    assert.equal((await a.post('/api/onboarding/complete')).status, 200)
    assert.equal(calls, 0)
    // Reopened setup reflects the latest full-editor settings, not an old completed draft.
    await a.put('/api/profile').send({ ...after.profile, roles: ['QA Engineer'] })
    assert.deepEqual((await a.get('/api/onboarding')).body.roles, ['QA Engineer'])
  } finally {
    await backend.close()
  }
})
test('setup validates input and authentication and cannot attach a different account resume', async () => {
  const backend = createApp({ dbPath: ':memory:', worker: false })
  try {
    assert.equal((await request(backend.app).get('/api/onboarding')).status, 401)
    const a = await account(backend, 'a@example.test'),
      b = await account(backend, 'b@example.test')
    const r = (
      await a.post('/api/resumes/text').send({
        text: 'Fixture candidate resume. Java developer with project experience and SQL knowledge.',
        filename: 'Fixture.txt',
      })
    ).body.resume
    assert.equal((await b.put('/api/onboarding').send({ ...draft, resumeId: r.id })).status, 404)
    assert.equal((await a.put('/api/onboarding').send({ ...draft, resumeId: r.id })).status, 200)
    assert.equal((await a.delete(`/api/resumes/${r.id}`)).status, 200)
    assert.equal((await a.post('/api/onboarding/complete')).status, 200)
    assert.equal((await a.get('/api/onboarding')).body.resumeId, null)
    for (const value of [
      { ...draft, step: 3 },
      { ...draft, experienceLevels: ['invalid'] },
      { ...draft, roles: Array(51).fill('Engineer') },
      { ...draft, completed: true },
      { ...draft, roles: [''] },
    ])
      assert.equal((await a.put('/api/onboarding').send(value)).status, 400)
    assert.deepEqual((await b.get('/api/onboarding')).body.roles, [])
  } finally {
    await backend.close()
  }
})
test('established users keep their workspace and skip is remembered without changing their profile', async () => {
  const backend = createApp({ dbPath: ':memory:', worker: false })
  try {
    const a = await account(backend, 'returning@example.test')
    const p = (await a.get('/api/profile')).body
    assert.equal(
      (await a.put('/api/profile').send({ ...p, roles: ['Engineer'], locations: ['India'] }))
        .status,
      200,
    )
    assert.equal((await a.get('/api/bootstrap')).body.onboarding.completed, true)
    const b = await account(backend, 'skip@example.test')
    await b.put('/api/onboarding').send({ ...draft, step: 1 })
    await b.post('/api/onboarding/dismiss')
    const state = (await b.get('/api/bootstrap')).body
    assert.equal(state.onboarding.dismissed, true)
    assert.equal(state.onboarding.step, 1)
    assert.deepEqual(state.profile.roles, [])
  } finally {
    await backend.close()
  }
})
test('draft progress survives a real database reopen and stays isolated by account', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = mkdtempSync(join(tmpdir(), 'setup-persistence-'))
  const dbPath = join(dir, 'fixture.sqlite')
  let backend = createApp({ dbPath, worker: false })
  try {
    const a = await account(backend, 'persist@example.test')
    const b = await account(backend, 'other@example.test')
    await a.put('/api/onboarding').send({ ...draft, step: 1 })
    const cookies = (
      await a
        .post('/api/auth/login')
        .send({ email: 'persist@example.test', password: 'Fixture only passphrase 2026!' })
    ).headers['set-cookie']
    assert.equal((await b.get('/api/onboarding')).body.step, 0)
    await backend.close()
    backend = createApp({ dbPath, worker: false })
    const after = await request(backend.app).get('/api/bootstrap').set('Cookie', cookies)
    assert.equal(after.status, 200)
    assert.equal(after.body.onboarding.step, 1)
    assert.deepEqual(after.body.onboarding.roles, draft.roles)
    assert.equal(after.body.onboarding.completed, false)
  } finally {
    await backend.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
