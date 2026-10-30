import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp } from './app.ts'
import { profileGuidance } from './profile-guidance.ts'
import { match, type RawJob } from './sources.ts'
import type { Profile } from '../shared/types.ts'
test('guidance is authenticated, strict, optional, read-only and never invokes a provider', async () => {
  let calls = 0
  const backend = createApp({
    dbPath: ':memory:',
    worker: false,
    fetcher: (async () => {
      calls++
      throw Error('unexpected provider call')
    }) as typeof fetch,
  })
  try {
    assert.equal((await request(backend.app).post('/api/profile/guidance').send({})).status, 401)
    const a = request.agent(backend.app)
    await a.post('/api/auth/register').send({
      name: 'Guidance QA',
      email: 'guidance@example.test',
      password: 'Local fixture passphrase 2026!',
    })
    const before = (await a.get('/api/profile')).body
    const input = {
      roles: ['Frontend Engineer'],
      skills: ['React'],
      locations: ['India'],
      experienceLevels: ['Internship', 'Entry level'],
    }
    const result = await a.post('/api/profile/guidance').send(input)
    assert.equal(result.status, 200)
    assert.equal(result.body.method, 'curated_rules')
    assert.equal(result.body.ready, true)
    assert.ok(result.body.suggestedSkills.includes('TypeScript'))
    assert.ok(!result.body.suggestedSkills.includes('React'))
    assert.equal(result.body.indiaDefaults.currency, 'INR')
    assert.deepEqual((await a.get('/api/profile')).body, before)
    assert.equal(calls, 0)
    assert.equal(
      (await a.post('/api/profile/guidance').send({ ...input, resume: 'private document' })).status,
      400,
    )
    assert.equal(
      (await a.post('/api/profile/guidance').send({ ...input, roles: Array(51).fill('Engineer') }))
        .status,
      400,
    )
    assert.equal(
      (await a.post('/api/profile/guidance').send({ ...input, experienceLevels: ['Bad'] })).status,
      400,
    )
  } finally {
    await backend.close()
  }
})
test('guidance explains missing setup and does not silently assert skills or country', () => {
  const result = profileGuidance(
    { roles: [], skills: [], locations: [] },
    { enabled: 0, webConfigured: false },
  )
  assert.equal(result.ready, false)
  assert.equal(result.steps.length, 4)
  assert.equal(result.indiaDefaults, null)
  assert.deepEqual(result.suggestedSkills, [])
  const custom = profileGuidance(
    { roles: ['Custom profession'], skills: [], locations: ['Canada'] },
    { enabled: 1, webConfigured: true },
  )
  assert.equal(custom.ready, true)
  assert.deepEqual(custom.suggestedSkills, [])
  assert.equal(custom.indiaDefaults, null)
})
test('explicit title experience ranges cannot masquerade as unknown internship eligibility', () => {
  const p = {
    roles: [],
    skills: [],
    locations: [],
    remoteOnly: false,
    experience: 'Internship',
    experienceLevels: ['Internship'],
    salaryMin: 0,
    includeUnknownSalary: true,
    companySizes: [],
  } as unknown as Profile
  const job = {
    title: 'Software Engineer - C, Embedded 4 - 8 years',
    description: '',
    location: 'India',
    remote: false,
    salaryMin: null,
    companySize: null,
  } as RawJob
  assert.equal(match(job, p).eligible, false)
  assert.equal(match(job, { ...p, experienceLevels: ['Mid level'] }).eligible, true)
  assert.equal(
    match({ ...job, title: 'Software Engineer (6+ yrs)' }, { ...p, experienceLevels: ['Senior'] })
      .eligible,
    true,
  )
  assert.equal(
    match(
      { ...job, title: 'Software Engineer (0–2 years)' },
      { ...p, experienceLevels: ['Entry level', 'Internship'] },
    ).eligible,
    true,
  )
  assert.equal(match({ ...job, title: 'Software Engineer' }, p).eligible, true)
  assert.equal(match({ ...job, title: 'Product Manager' }, p).eligible, true)
  assert.equal(
    match(
      {
        ...job,
        title: 'Software Engineer - ERP',
        description: 'Qualifications 6 plus years of experience in the relevant domain',
      },
      p,
    ).eligible,
    false,
  )
  assert.equal(
    match(
      {
        ...job,
        title: 'Software Engineer',
        description: 'Our company was founded 6 years ago. We build software.',
      },
      p,
    ).eligible,
    true,
  )
  assert.equal(
    match(
      {
        ...job,
        title: 'Software Engineer',
        description: 'Requirements: 3–5 years of professional experience',
      },
      { ...p, experienceLevels: ['Mid level'] },
    ).eligible,
    true,
  )
})
