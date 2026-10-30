import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import request from 'supertest'
import { createWebDiscovery, normalizeIndexedJobs, WEB_SOURCE_ID } from './web-discovery.ts'
import { collectWithCoverage } from './sources.ts'
import { createApp } from './app.ts'
import type { Profile, Source } from '../shared/types.ts'
const profile = {
  roles: ['Engineer', 'Designer'],
  locations: ['India'],
  location: '',
  remoteOnly: false,
} as Profile
const indexed = (title = 'Engineer', url = 'https://company.example/jobs/1') => ({
  title,
  company_name: 'Small Company',
  location: 'India',
  via: 'LinkedIn',
  description: 'Build products',
  apply_options: [
    { title: 'Employer', link: url },
    { title: 'LinkedIn', link: 'https://www.linkedin.com/jobs/view/123' },
    { title: 'Indeed', link: 'https://indeed.com/viewjob?jk=123' },
  ],
})
const free = {
  account_id: 'fixture',
  plan_monthly_price: 0,
  account_status: 'Active',
  plan_searches_left: 250,
  plan_renewal_date: '2026-11-30',
}
const env = { SERPAPI_API_KEY: 'fixture-private-key', ENABLE_WEB_DISCOVERY: 'true' }
const response = (data: unknown) => new Response(JSON.stringify(data))
test('index preserves platform links, rejects unsafe links and zero limit, does not invent salary', () => {
  const jobs = normalizeIndexedJobs(
    [
      indexed(),
      indexed(),
      indexed('Bad', 'http://unsafe.example/job'),
      indexed('Bad', 'https://127.0.0.1/job'),
    ],
    10,
  )
  // Unsafe primary links can still have valid platform alternatives.
  assert.equal(jobs[0].applyLinks?.length, 3)
  assert.equal(jobs[0].via, 'LinkedIn')
  assert.equal(jobs[0].salaryMin, null)
  assert.ok(jobs.every((j) => j.url.startsWith('https://') && !j.url.includes('127.0.0.1')))
  assert.deepEqual(normalizeIndexedJobs([indexed()], 0), [])
  assert.equal(normalizeIndexedJobs([indexed(), indexed()], 10).length, 1)
})
test('breadth first queries continue after an exhausted query and paginate opaque tokens only on fixed host', async () => {
  const db = new DatabaseSync(':memory:')
  const calls: URL[] = []
  try {
    const service = createWebDiscovery(db, env, (async (input) => {
      const u = new URL(String(input))
      calls.push(u)
      if (u.pathname === '/account.json') return response(free)
      const designer = u.searchParams.get('q')!.startsWith('Designer')
      return response({
        jobs_results: [
          indexed(designer ? 'Designer' : 'Engineer', `https://employer.example/${calls.length}`),
        ],
        ...(designer ? { serpapi_pagination: { next_page_token: 'opaque-token' } } : {}),
      })
    }) as typeof fetch)
    const result = await service.search(profile, 100)
    assert.equal(result.coverage.pages, 3)
    assert.equal(result.coverage.queries.length, 2)
    assert.equal(calls[3].searchParams.get('next_page_token'), 'opaque-token')
    assert.ok(calls.every((u) => u.origin === 'https://serpapi.com'))
    assert.equal(result.coverage.status, 'limited') // repeating token is incomplete
  } finally {
    db.close()
  }
})
test('no key and paid or unknown accounts cannot issue a search; provider errors do not leak the key', async () => {
  for (const account of [
    { ...free, plan_monthly_price: 1 },
    { ...free, plan_monthly_price: undefined },
  ]) {
    const db = new DatabaseSync(':memory:')
    let calls = 0
    try {
      const service = createWebDiscovery(db, env, (async () => {
        calls++
        return response(account)
      }) as typeof fetch)
      await assert.rejects(service.search(profile, 100), /\$0/)
      assert.equal(calls, 1)
    } finally {
      db.close()
    }
  }
  const db = new DatabaseSync(':memory:')
  try {
    let calls = 0
    await assert.rejects(
      createWebDiscovery(db, {}, (async () => {
        calls++
        throw Error('unexpected')
      }) as typeof fetch).search(profile, 100),
      /not configured/,
    )
    assert.equal(calls, 0)
    await assert.rejects(
      createWebDiscovery(db, env, (async () => {
        throw Error(env.SERPAPI_API_KEY)
      }) as typeof fetch).search(profile, 100),
      (error) => !String(error).includes(env.SERPAPI_API_KEY),
    )
  } finally {
    db.close()
  }
})
test('shared budget is atomic across concurrent searches and persists across service reinitialization', async () => {
  const db = new DatabaseSync(':memory:')
  let searches = 0
  const fetcher = (async (input) => {
    const u = new URL(String(input))
    if (u.pathname === '/account.json') return response(free)
    searches++
    return response({ jobs_results: [indexed()], serpapi_pagination: { next_page_token: 'more' } })
  }) as typeof fetch
  try {
    const service = createWebDiscovery(db, { ...env, WEB_SEARCH_MONTHLY_CAP: '2' }, fetcher)
    const results = await Promise.allSettled([
      service.search(profile, 100),
      service.search(profile, 100),
    ])
    assert.equal(searches, 2)
    assert.ok(results.some((r) => r.status === 'fulfilled'))
    await assert.rejects(
      createWebDiscovery(db, { ...env, WEB_SEARCH_MONTHLY_CAP: '2' }, fetcher).search(profile, 100),
      /budget/,
    )
    assert.equal(searches, 2)
  } finally {
    db.close()
  }
})
test('six request cap exposes omitted role/location combinations', async () => {
  const db = new DatabaseSync(':memory:')
  try {
    const service = createWebDiscovery(db, env, (async (input) =>
      new URL(String(input)).pathname === '/account.json'
        ? response(free)
        : response({ jobs_results: [] })) as typeof fetch)
    const result = await service.search(
      { ...profile, roles: ['A', 'B', 'C', 'D'], locations: ['India', 'UK'] },
      100,
    )
    assert.equal(result.coverage.pages, 6)
    assert.equal(result.coverage.omittedQueries, 2)
    assert.equal(result.coverage.status, 'limited')
  } finally {
    db.close()
  }
})
test('feed follows numbered pages on fixed endpoint, preserves partial data when a later page fails', async () => {
  const calls: string[] = []
  const source = { id: 'feed', name: 'Feed', type: 'arbeitnow', slug: '' } as Source
  const result = await collectWithCoverage(source, 300, (async (input) => {
    calls.push(String(input))
    if (calls.length === 3) throw Error('offline')
    return response({
      data: [
        {
          title: 'Engineer',
          company_name: 'Small Company',
          url: `https://employer.example/job/${calls.length}`,
        },
      ],
      links: { next: 'https://evil.example/private' },
    })
  }) as typeof fetch)
  assert.equal(result.jobs.length, 2)
  assert.equal(result.coverage.status, 'limited')
  assert.equal(result.coverage.pages, 2)
  assert.equal(calls[1], 'https://www.arbeitnow.com/api/job-board-api?page=2')
  assert.ok(calls.every((url) => !url.includes('evil')))
})
test('query-specific jobs stay private, cannot be tracked by another account, and survive another account scan', async () => {
  let jobNumber = 0
  const backend = createApp({
    dbPath: ':memory:',
    worker: false,
    env,
    fetcher: (async (input) => {
      const u = new URL(String(input))
      if (u.pathname === '/account.json') return response(free)
      if (u.hostname === 'www.arbeitnow.com') return response({ data: [] })
      return response({
        jobs_results: [indexed('Engineer', `https://employer.example/job/${++jobNumber}`)],
      })
    }) as typeof fetch,
  })
  try {
    const a = request.agent(backend.app),
      b = request.agent(backend.app)
    for (const [agent, name] of [
      [a, 'Alpha'],
      [b, 'Beta'],
    ] as const) {
      await agent
        .post('/api/auth/register')
        .send({ name, email: `${name}@example.test`, password: 'Fixture passphrase 2026!' })
      const p = (await agent.get('/api/profile')).body
      await agent.put('/api/profile').send({ ...p, roles: ['Engineer'], locations: ['India'] })
    }
    await a.post('/api/discovery/run')
    await backend.settle()
    const jobs = (await a.get('/api/jobs')).body.jobs
    assert.equal(jobs.length, 1)
    const id = jobs[0].id
    assert.equal((await b.get('/api/jobs')).body.jobs.length, 0)
    assert.equal((await b.get(`/api/jobs/${id}`)).status, 404)
    assert.equal(
      (await b.post('/api/applications').send({ jobId: id, status: 'saved' })).status,
      404,
    )
    await a.post('/api/applications').send({ jobId: id, status: 'saved' })
    await b.post('/api/discovery/run')
    await backend.settle()
    assert.equal((await a.get(`/api/jobs/${id}`)).status, 200)
    assert.equal((await a.get('/api/applications')).body.applications.length, 1)
    assert.equal((await a.get('/api/jobs')).body.jobs.length, 1)
    assert.equal((await b.get('/api/jobs')).body.jobs.length, 1)
    const run = (await a.get('/api/discovery/runs')).body.runs[0]
    assert.ok(run.coverage.some((c: any) => c.source === WEB_SOURCE_ID && c.queries.length === 1))
  } finally {
    await backend.close()
  }
})

test('monthly reservations survive a real database close and reopen; result truncation is visible', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'web-budget-')),
    path = join(dir, 'budget.sqlite')
  let db = new DatabaseSync(path)
  const fetcher = (async (input) =>
    new URL(String(input)).pathname === '/account.json'
      ? response(free)
      : response({
          jobs_results: [indexed(), indexed('Other', 'https://employer.example/other')],
        })) as typeof fetch
  try {
    const result = await createWebDiscovery(
      db,
      { ...env, WEB_SEARCH_MONTHLY_CAP: '1' },
      fetcher,
    ).search({ ...profile, roles: ['Engineer'] }, 1)
    assert.equal(result.jobs.length, 1)
    assert.equal(result.coverage.status, 'limited')
    assert.match(result.coverage.note, /truncated/)
    db.close()
    db = new DatabaseSync(path)
    await assert.rejects(
      createWebDiscovery(db, { ...env, WEB_SEARCH_MONTHLY_CAP: '1' }, fetcher).search(profile, 100),
      /budget/,
    )
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
