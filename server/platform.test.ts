import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp } from './app.ts'
import { match, collect, sourceUrl, roleMatches } from './sources.ts'
import { analyze, hasSkill } from './resume.ts'
import { localSuggestions } from './ai.ts'
import { nextDailyRun } from './schedule.ts'
import type { Profile, Source, Settings } from '../shared/types.ts'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const fixture = {
  title: 'Frontend Developer',
  company_name: 'Fixture Labs',
  location: 'India · Remote',
  remote: true,
  url: 'https://example.com/test-role',
  description: 'Build accessible React and TypeScript products. SQL experience helpful.',
  created_at: 1793232000,
}
const fakeFetch = (async () =>
  new Response(JSON.stringify({ data: [fixture] }), {
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch
const account = (name: string) => ({
  name,
  email: `${name.toLowerCase()}@example.test`,
  password: 'Example test passphrase 9247',
})
test('accounts, persistent ownership, discovery, resume edits, admin and extension authorization', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'job-hunter-')),
    dbPath = join(temp, 'test.sqlite')
  let backend = createApp({ dbPath, fetcher: fakeFetch, worker: false })
  try {
    const admin = request.agent(backend.app),
      user = request.agent(backend.app)
    assert.equal((await request(backend.app).get('/api/profile')).status, 401)
    const registered = await admin.post('/api/auth/register').send(account('Admin'))
    assert.equal(registered.status, 201)
    assert.equal(registered.body.user.role, 'admin')
    assert.match(registered.headers['set-cookie'][0], /HttpOnly/)
    assert.equal((await user.post('/api/auth/register').send(account('User'))).status, 201)
    assert.equal((await user.get('/api/admin')).status, 403)
    assert.equal(
      (await user.patch('/api/admin/settings').send({ brandName: 'Bad change' })).status,
      403,
    )
    assert.equal(
      (
        await request(backend.app)
          .post('/api/auth/login')
          .send({ email: account('Admin').email, password: 'wrong password' })
      ).status,
      401,
    )
    assert.equal(
      (await admin.put('/api/profile').set('Origin', 'https://evil.example').send({})).status,
      403,
    )
    const profile: Profile = (await admin.get('/api/profile')).body
    const updated = {
      ...profile,
      roles: ['Frontend Engineer'],
      skills: ['React', 'TypeScript'],
      locations: ['India'],
      scheduleEnabled: true,
      scheduleHour: 9,
      timezone: 'Asia/Kolkata',
    }
    assert.equal((await admin.put('/api/profile').send(updated)).status, 200)
    const started = await admin.post('/api/discovery/run')
    assert.equal(started.status, 202)
    await backend.settle()
    const jobs = (await admin.get('/api/jobs')).body.jobs
    assert.equal(jobs.length, 1)
    assert.equal(jobs[0].company, 'Fixture Labs')
    assert.equal(jobs[0].matchScore, 100)
    assert.equal(
      (await admin.post('/api/applications').send({ jobId: jobs[0].id, status: 'saved' })).status,
      200,
    )
    const app = (await admin.get('/api/applications')).body.applications[0]
    assert.equal(
      (await user.patch(`/api/applications/${app.id}`).send({ status: 'offer' })).status,
      404,
    )
    assert.equal(
      (
        await admin
          .patch(`/api/applications/${app.id}`)
          .send({ status: 'preparing', notes: 'Review job description' })
      ).status,
      200,
    )
    assert.equal((await user.get('/api/applications')).body.applications.length, 0)
    const original =
      'Alex Example\nalex@example.test +91 9876543210\nEXPERIENCE\nResponsible for accessible React components. Improved response time by 25%.\nEDUCATION\nComputer science\nSKILLS\nReact, TypeScript\nPROJECTS\nCreated 3 projects for 100 users.'
    const uploaded = await admin
      .post('/api/resumes/upload')
      .attach('file', Buffer.from(original), 'resume.txt')
    assert.equal(uploaded.status, 201)
    const id = uploaded.body.resume.id
    assert.equal((await user.patch(`/api/resumes/${id}`).send({ text: original })).status, 404)
    const reviewed = await admin.post(`/api/resumes/${id}/analyze`).send({ jobId: jobs[0].id })
    assert.equal(reviewed.status, 200)
    assert.equal(reviewed.body.resume.analysis.engine, 'rules')
    const suggestion = reviewed.body.resume.analysis.suggestions.find((s: any) => s.before)
    assert.ok(suggestion)
    const accepted = await admin
      .patch(`/api/resumes/${id}/suggestions/${suggestion.id}`)
      .send({ status: 'accepted' })
    assert.ok(accepted.body.resume.text.includes(suggestion.after))
    const undone = await admin
      .patch(`/api/resumes/${id}/suggestions/${suggestion.id}`)
      .send({ status: 'pending' })
    assert.equal(undone.body.resume.text, original)
    assert.equal(
      (
        await admin
          .post('/api/resumes/upload')
          .attach('file', Buffer.from('not executable'), 'resume.exe')
      ).status,
      415,
    )
    assert.equal(
      (
        await admin
          .post('/api/resumes/upload')
          .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1, 65), 'resume.txt')
      ).status,
      413,
    )
    assert.equal(
      (await admin.post('/api/resumes/upload').attach('file', Buffer.from('not pdf'), 'resume.pdf'))
        .status,
      400,
    )
    assert.equal(
      (
        await admin
          .post('/api/admin/sources')
          .send({ name: 'Bad', type: 'greenhouse', slug: 'http://127.0.0.1', enabled: true })
      ).status,
      400,
    )
    const token = (await admin.post('/api/extension/token')).body.token
    assert.equal(
      (
        await request(backend.app)
          .get('/api/extension/profile')
          .set('Origin', 'chrome-extension://' + 'a'.repeat(32))
          .set('Authorization', `Bearer ${token}`)
      ).body.profile.email,
      updated.email,
    )
    assert.equal((await admin.delete('/api/extension/token')).status, 200)
    assert.equal(
      (
        await request(backend.app)
          .get('/api/extension/profile')
          .set('Authorization', `Bearer ${token}`)
      ).status,
      401,
    )
    backend.tick(new Date('2026-10-29T04:00:00Z'))
    await backend.settle()
    const count = (await admin.get('/api/discovery/runs')).body.runs.length
    backend.tick(new Date('2026-10-29T06:00:00Z'))
    await backend.settle()
    assert.equal((await admin.get('/api/discovery/runs')).body.runs.length, count)
    assert.equal((await admin.post('/api/discovery/run')).status, 202)
    await backend.settle()
    assert.equal((await admin.get('/api/applications')).body.applications.length, 1)
    const cookie = registered.headers['set-cookie'][0].split(';')[0]
    await backend.close()
    backend = createApp({ dbPath, fetcher: fakeFetch, worker: false })
    const persisted = await request(backend.app).get('/api/bootstrap').set('Cookie', cookie)
    assert.equal(persisted.status, 200)
    assert.deepEqual(persisted.body.profile.roles, ['Frontend Engineer'])
    assert.equal(
      (await request(backend.app).get('/api/resumes').set('Cookie', cookie)).body.resumes.length,
      1,
    )
    assert.equal(
      (await request(backend.app).get('/api/applications').set('Cookie', cookie)).body
        .applications[0].notes,
      'Review job description',
    )
    assert.equal(
      (await request(backend.app).post('/api/auth/logout').set('Cookie', cookie)).status,
      200,
    )
    assert.equal((await request(backend.app).get('/api/profile').set('Cookie', cookie)).status, 401)
  } finally {
    await backend.close()
    rmSync(temp, { recursive: true, force: true })
  }
})
test('daily scheduling respects half-hour offsets, local days, catch-up and disabled state', () => {
  const p = { timezone: 'Asia/Kolkata', scheduleEnabled: true, scheduleHour: 9 } as Profile
  assert.equal(nextDailyRun(p, null, new Date('2026-10-29T02:00:00Z')), '2026-10-29T03:30:00.000Z')
  assert.equal(nextDailyRun(p, null, new Date('2026-10-29T04:00:00Z')), '2026-10-29T04:00:00.000Z')
  assert.equal(
    nextDailyRun(p, '2026-10-29', new Date('2026-10-29T04:00:00Z')),
    '2026-10-30T03:30:00.000Z',
  )
  assert.equal(nextDailyRun({ ...p, scheduleEnabled: false }, null), null)
  assert.equal(
    nextDailyRun({ ...p, timezone: 'Asia/Kathmandu' }, null, new Date('2026-10-29T02:00:00Z')),
    '2026-10-29T03:15:00.000Z',
  )
})
test('matching respects geography, salary unknowns, role aliases and skill boundaries', () => {
  const profile = {
    roles: ['Frontend Engineer'],
    skills: [],
    locations: ['India'],
    remoteOnly: true,
    salaryMin: 0,
    includeUnknownSalary: true,
    companySizes: [],
    experience: '',
  } as unknown as Profile
  const job = {
    ...fixture,
    id: 'job',
    company: 'Fixture Labs',
    source: 'test',
    postedAt: null,
    fetchedAt: new Date().toISOString(),
    salaryMin: null,
    salaryMax: null,
    currency: null,
    companySize: null,
  }
  assert.equal(roleMatches('Senior Front-end Developer', 'Frontend Engineer'), true)
  assert.equal(match({ ...job, location: 'US Remote' }, profile).eligible, false)
  assert.equal(match({ ...job, location: 'Remote worldwide' }, profile).eligible, true)
  assert.equal(
    match(
      { ...job, location: 'India Remote' },
      { ...profile, salaryMin: 1000, includeUnknownSalary: false },
    ).eligible,
    false,
  )
  assert.equal(hasSkill('Collaboration and regional work', 'R'), false)
  assert.equal(hasSkill('React and C++ software', 'C++'), true)
  const a = analyze(
    'Experience\nBuilt React apps, reduced time 25%.',
    { ...profile, skills: ['React'] } as Profile,
    'React and TypeScript are required',
  )
  assert.ok(a.missingSkills.includes('TypeScript'))
  assert.ok(a.dimensions.find((d) => d.name === 'Evidence of impact')!.score > 0)
})
test('source failure is visible and in-flight collection preserves admin controls', async () => {
  let release: (v: Response) => void = () => {}
  const fetcher = (() =>
    new Promise<Response>((r) => {
      release = r
    })) as typeof fetch
  const b = createApp({ dbPath: ':memory:', worker: false, fetcher })
  try {
    const a = request.agent(b.app)
    await a.post('/api/auth/register').send(account('Owner'))
    const s = (await a.get('/api/sources')).body.sources[0]
    await a.post('/api/discovery/run')
    await a.patch(`/api/admin/sources/${s.id}`).send({ enabled: false, name: 'Paused by owner' })
    release(new Response(JSON.stringify({ data: [fixture] })))
    await b.settle()
    const after = (await a.get('/api/sources')).body.sources[0]
    assert.equal(after.enabled, false)
    assert.equal(after.name, 'Paused by owner')
  } finally {
    await b.close()
  }
  const failed = createApp({
    dbPath: ':memory:',
    worker: false,
    fetcher: (async () => new Response('failure', { status: 503 })) as typeof fetch,
  })
  try {
    const a = request.agent(failed.app)
    await a.post('/api/auth/register').send(account('Owner'))
    await a.post('/api/discovery/run')
    await failed.settle()
    assert.equal((await a.get('/api/discovery/runs')).body.runs[0].status, 'failed')
    assert.match((await a.get('/api/sources')).body.sources[0].lastError, /503/)
  } finally {
    await failed.close()
  }
})
test('all supported source adapters normalize real response shapes and allowlists', async () => {
  const base = {
    id: 'test',
    name: 'Fixture company',
    slug: 'fixture',
    enabled: true,
    lastRun: null,
    lastError: null,
    jobCount: 0,
  } as Source
  for (const type of ['greenhouse', 'lever', 'ashby'] as const) {
    const payload =
      type === 'greenhouse'
        ? {
            jobs: [
              {
                title: 'Engineer',
                absolute_url: 'https://example.com/gh',
                location: { name: 'India' },
                content: 'React',
              },
            ],
          }
        : type === 'lever'
          ? [
              {
                text: 'Engineer',
                hostedUrl: 'https://example.com/lever',
                categories: { location: 'India' },
                description: 'React',
                salaryRange: { interval: 'year', currency: 'USD', min: 100, max: 200 },
              },
            ]
          : {
              jobs: [
                {
                  title: 'Engineer',
                  jobUrl: 'https://example.com/ashby',
                  location: 'India',
                  descriptionPlain: 'React',
                  isRemote: true,
                  compensation: {
                    summaryComponents: [
                      {
                        compensationType: 'Salary',
                        interval: '1 YEAR',
                        currencyCode: 'INR',
                        minValue: 100,
                        maxValue: 200,
                      },
                    ],
                  },
                },
              ],
            }
    const jobs = await collect(
      { ...base, type },
      100,
      (async () => new Response(JSON.stringify(payload))) as typeof fetch,
    )
    assert.equal(jobs.length, 1)
    assert.equal(jobs[0].location, 'India')
    if (type !== 'greenhouse') assert.equal(jobs[0].salaryMin, 100)
  }
  assert.throws(() => sourceUrl({ ...base, type: 'greenhouse', slug: '../localhost' }))
})
test('local AI only applies valid exact-excerpt drafts and falls back honestly', async () => {
  const text = 'Experience\nBuilt a team dashboard by building accessible React apps.'
  const a = analyze(text, { skills: [] } as unknown as Profile)
  const s = { aiEnabled: true, ollamaModel: 'test:local' } as Settings
  const fake = (async () =>
    new Response(
      JSON.stringify({
        message: {
          content: JSON.stringify({
            suggestions: [
              {
                title: 'Clearer action',
                detail: 'Review the wording',
                before: 'building accessible React apps',
                after: 'developing accessible React applications',
              },
              {
                title: 'Bad',
                detail: 'Unknown excerpt',
                before: 'not in resume',
                after: 'invented',
              },
            ],
          }),
        },
      }),
    )) as typeof fetch
  const enriched = await localSuggestions(a, text, s, fake)
  assert.equal(enriched.engine, 'ollama')
  assert.equal(enriched.suggestions.filter((v) => v.category === 'local AI').length, 1)
  const fallback = await localSuggestions(a, text, s, (async () => {
    throw Error('offline')
  }) as typeof fetch)
  assert.equal(fallback.engine, 'rules')
  assert.match(fallback.notice, /could not return usable suggestions/)
})
test('PDF and DOCX uploads extract actual document text', async () => {
  const b = createApp({ dbPath: ':memory:', worker: false })
  try {
    const a = request.agent(b.app)
    await a.post('/api/auth/register').send(account('Document'))
    for (const ext of ['pdf', 'docx']) {
      const uploaded = await a
        .post('/api/resumes/upload')
        .attach('file', `tests/fixtures/resume.${ext}`)
      assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body))
      assert.match(uploaded.body.resume.text, /accessible React/)
      assert.match(uploaded.body.resume.text, /alex@example.test/)
    }
  } finally {
    await b.close()
  }
})

test('distinct job identifiers in URL queries are retained; disappeared listings leave discovery but stay tracked', async () => {
  const { canonicalJobUrl } = await import('./sources.ts')
  assert.notEqual(
    canonicalJobUrl('https://example.test/jobs?gh_jid=1'),
    canonicalJobUrl('https://example.test/jobs?gh_jid=2'),
  )
  assert.equal(
    canonicalJobUrl('https://example.test/jobs?gh_jid=1&utm_source=ad'),
    canonicalJobUrl('https://example.test/jobs?gh_jid=1'),
  )
  let present = true
  const b = createApp({
    dbPath: ':memory:',
    worker: false,
    fetcher: (async () =>
      new Response(JSON.stringify({ data: present ? [fixture] : [] }))) as typeof fetch,
  })
  try {
    const a = request.agent(b.app)
    await a.post('/api/auth/register').send(account('Fresh'))
    await a.post('/api/discovery/run')
    await b.settle()
    const job = (await a.get('/api/jobs')).body.jobs[0]
    await a.post('/api/applications').send({ jobId: job.id, status: 'saved' })
    present = false
    await a.post('/api/discovery/run')
    await b.settle()
    assert.equal((await a.get('/api/jobs')).body.jobs.length, 0)
    assert.equal((await a.get('/api/applications')).body.applications.length, 1)
    assert.equal((await a.get('/api/applications')).body.applications[0].job.available, false)
  } finally {
    await b.close()
  }
})
