import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import request from 'supertest'
import { createApp } from './app.ts'
import { amazonJobs, createCareerDiscovery, CAREER_SOURCE_ID } from './career-discovery.ts'
import {
  careerUrl,
  publicAddress,
  publicText,
  readCareerPage,
  robotsAllowed,
} from './career-fetch.ts'
import { detectBoard, pageLinks, structuredJobs } from './career-pages.ts'
import type { Profile, Source } from '../shared/types.ts'
const profile = {
  roles: ['Software Engineer'],
  locations: ['India'],
  skills: [],
} as unknown as Profile
const source = { id: CAREER_SOURCE_ID, name: 'Careers' } as Source
const json = (v: unknown) =>
  new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } })
const jobPage = (url = 'https://employer.example/careers/engineer') =>
  `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: 'Software Engineer', hiringOrganization: { name: 'Example Employer' }, url, jobLocation: { address: { addressLocality: 'Bengaluru', addressCountry: 'India' } }, description: 'Build software' })}</script>`
test('ATS detection handles employer career URLs and exact public hosts without guessed slugs', () => {
  assert.deepEqual(detectBoard('https://stripe.com/careers/listing/x/7844214'), {
    name: 'Stripe',
    type: 'greenhouse',
    slug: 'stripe',
  })
  for (const [url, type, slug] of [
    ['https://job-boards.greenhouse.io/enterpret/jobs/1', 'greenhouse', 'enterpret'],
    ['https://jobs.lever.co/startup/123', 'lever', 'startup'],
    ['https://jobs.ashbyhq.com/Commure/123', 'ashby', 'Commure'],
  ])
    assert.deepEqual(detectBoard(url), { name: slug, type, slug })
  assert.equal(detectBoard('https://jobs.lever.co.evil.example/startup'), null)
  assert.equal(detectBoard('https://stripe.com/other'), null)
  assert.deepEqual(
    pageLinks(
      '<a href="/careers/job">Job</a><a href="http://127.0.0.1/">Bad</a>',
      'https://employer.example',
    ),
    ['https://employer.example/careers/job'],
  )
})
test('public reader rejects private, reserved, encoded IP and mixed DNS addresses before requesting', async () => {
  for (const ip of [
    '127.0.0.1',
    '10.0.0.1',
    '100.100.100.200',
    '169.254.169.254',
    '192.168.1.1',
    '::1',
    '::ffff:127.0.0.1',
    '2001:db8::1',
  ])
    assert.equal(publicAddress(ip), false, ip)
  assert.equal(publicAddress('8.8.8.8'), true)
  assert.equal(publicAddress('2606:4700:4700::1111'), true)
  for (const url of [
    'http://example.com',
    'https://127.1',
    'https://2130706433',
    'https://[::1]',
    'https://name:pass@example.com',
    'https://foo.local',
    'https://example.com:444',
  ])
    assert.throws(() => careerUrl(url))
  await assert.rejects(
    () => publicText('https://employer.example', async () => [{ address: '127.0.0.1', family: 4 }]),
    /private/,
  )
  await assert.rejects(
    () =>
      publicText('https://employer.example', async () => [
        { address: '8.8.8.8', family: 4 },
        { address: '10.0.0.1', family: 4 },
      ]),
    /private/,
  )
})
test('robots rules prevent page fetch, and failed access verification is not silently ignored', async () => {
  assert.equal(
    robotsAllowed('User-agent: *\nDisallow: /careers\nAllow: /careers/public', '/careers/private'),
    false,
  )
  assert.equal(
    robotsAllowed('User-agent: *\nDisallow: /careers\nAllow: /careers/public', '/careers/public'),
    true,
  )
  assert.equal(
    robotsAllowed('User-agent: *\nDisallow: /\nUser-agent: JobHunter\nAllow: /careers', '/careers'),
    true,
  )
  let calls = 0
  await assert.rejects(
    () =>
      readCareerPage('https://employer.example/careers', async () => {
        calls++
        return { status: 200, text: 'User-agent: *\nDisallow: /' }
      }),
    /disallows/,
  )
  assert.equal(calls, 1)
  await assert.rejects(
    () =>
      readCareerPage('https://employer.example/careers', async () => ({ status: 503, text: '' })),
    /verify/,
  )
})
test('structured career pages normalize graph/list data, preserve unknowns and omit expired or invalid jobs', () => {
  const html =
    jobPage() +
    jobPage() +
    `<script type="application/ld+json">invalid</script>` +
    `<script type="application/ld+json">${JSON.stringify({ '@graph': [{ '@type': 'JobPosting', title: 'Expired', url: 'https://employer.example/old', hiringOrganization: { name: 'Example' }, validThrough: '2000-01-01' }] })}</script>`
  const jobs = structuredJobs(html, 'https://employer.example/careers', source, 10)
  assert.equal(jobs.length, 1)
  assert.equal(jobs[0].location, 'Bengaluru, India')
  assert.equal(jobs[0].salaryMin, null)
  assert.equal(structuredJobs(html, 'https://employer.example/careers', source, 0).length, 0)
  assert.equal(
    structuredJobs('<html>JS app</html>', 'https://employer.example/careers', source, 10).length,
    0,
  )
})
test('Amazon paginates real result offsets, deduplicates roles and keeps the India country filter', async () => {
  const urls: URL[] = []
  const result = await amazonJobs(profile, (async (input: any) => {
    const url = new URL(String(input))
    urls.push(url)
    const offset = Number(url.searchParams.get('offset'))
    return json({
      hits: 3,
      jobs: (offset ? [2] : [0, 1]).map((i) => ({
        job_path: `/en/jobs/${100 + i}/engineer`,
        title: 'Software Engineer',
        location: 'IN, KA, Bengaluru',
        country_code: 'IND',
        description: 'Build',
        basic_qualifications: '1 year',
        posted_date: 'October 30, 2026',
      })),
    })
  }) as typeof fetch)
  assert.equal(result.jobs.length, 3)
  assert.equal(result.pages, 2)
  assert.equal(result.check.status, 'completed')
  assert.deepEqual(
    urls.map((u) => u.searchParams.get('offset')),
    ['0', '2'],
  )
  assert.ok(
    urls.every((u) => u.hostname === 'www.amazon.jobs' && u.searchParams.get('country') === 'IND'),
  )
  assert.ok(
    result.jobs.every(
      (j) => j.location.includes('India') && j.url.startsWith('https://www.amazon.jobs/en/jobs/'),
    ),
  )
  let calls = 0
  const partial = await amazonJobs(profile, (async () => {
    if (calls++) throw Error('offline')
    return json({
      hits: 99,
      jobs: [{ job_path: '/en/jobs/123/engineer', title: 'Engineer', location: 'India' }],
    })
  }) as typeof fetch)
  assert.equal(partial.jobs.length, 1)
  assert.equal(partial.check.status, 'limited')
})
test('automatic scan reads more than300 Stripe jobs, discovers a startup board and caches without provider searches', async () => {
  const db = new DatabaseSync(':memory:')
  let requests = 0
  const fetcher = (async (input: any) => {
    requests++
    const u = new URL(String(input))
    if (u.hostname === 'www.amazon.jobs') return json({ hits: 0, jobs: [] })
    if (u.hostname === 'api.lever.co')
      return json([
        {
          text: 'Software Engineer',
          hostedUrl: 'https://jobs.lever.co/newstartup/1',
          categories: { location: 'India' },
          descriptionPlain: 'Build',
        },
      ])
    const stripe = u.pathname.includes('/stripe/')
    return json({
      jobs: Array.from({ length: stripe ? 746 : 1 }, (_, i) => ({
        id: i,
        title: 'Software Engineer',
        absolute_url: `https://${stripe ? 'stripe.com' : 'employer.example'}/careers/${u.pathname.split('/').filter(Boolean).at(-2)}-${i}`,
        jobUrl: `https://employer.example/${u.pathname}/${i}`,
        location: { name: 'India' },
        content: 'Build software',
        descriptionHtml: 'Build software',
      })),
    })
  }) as typeof fetch
  try {
    const career = createCareerDiscovery(
      db,
      fetcher,
      async () => '<a href="https://jobs.lever.co/newstartup">Jobs</a>',
    )
    career.addSite('https://startup.example/careers')
    const result = await career.search(profile, [])
    assert.ok(result.coverage.checks?.some((c) => c.name === 'Stripe' && c.jobs === 746))
    assert.ok(result.coverage.checks?.some((c) => c.name === 'newstartup'))
    assert.ok(result.jobs.every((j) => j.source === CAREER_SOURCE_ID))
    const before = requests
    await career.search(profile, [])
    assert.equal(requests, before)
    assert.equal(result.coverage.status, 'limited')
  } finally {
    db.close()
  }
})
test('career controls are admin-only; one discovery run owns collected results and new accounts remain empty', async () => {
  const backend = createApp({
    dbPath: ':memory:',
    worker: false,
    fetcher: (async (input: any) =>
      String(input).includes('amazon.jobs')
        ? json({ hits: 0, jobs: [] })
        : json({
            jobs: [
              {
                title: 'Software Engineer',
                absolute_url: 'https://employer.example/jobs/1',
                jobUrl: 'https://employer.example/jobs/1',
                location: 'India',
                content: 'Build',
              },
            ],
            data: [],
          })) as typeof fetch,
  })
  try {
    const a = request.agent(backend.app),
      b = request.agent(backend.app)
    await a.post('/api/auth/register').send({
      name: 'Admin',
      email: 'admin@example.test',
      password: 'Fixture only passphrase 2026!',
    })
    await b.post('/api/auth/register').send({
      name: 'Other',
      email: 'other@example.test',
      password: 'Fixture only passphrase 2026!',
    })
    assert.equal((await b.post('/api/admin/career-discovery').send({ enabled: true })).status, 403)
    assert.equal(
      (await a.post('/api/admin/career-sites').send({ url: 'http://127.0.0.1' })).status,
      400,
    )
    assert.equal((await a.post('/api/admin/career-discovery').send({ enabled: true })).status, 200)
    const p = (await a.get('/api/profile')).body
    await a.put('/api/profile').send({ ...p, roles: ['Software Engineer'], locations: ['India'] })
    const run = await a.post('/api/discovery/run')
    assert.equal(run.status, 202)
    await backend.settle()
    const runs = (await a.get('/api/discovery/runs')).body.runs
    assert.equal(runs.length, 1)
    assert.ok(runs[0].coverage.some((c: any) => c.source === CAREER_SOURCE_ID))
    assert.ok((await a.get('/api/bootstrap')).body.overview.jobs > 0)
    assert.equal((await b.get('/api/bootstrap')).body.overview.jobs, 0)
  } finally {
    await backend.close()
  }
})
test('additional career URL budget rotates across scans and unsupported pages remain explicitly unchecked', async () => {
  const db = new DatabaseSync(':memory:')
  const pages: string[] = []
  try {
    const career = createCareerDiscovery(
      db,
      (async (input: any) =>
        String(input).includes('amazon.jobs')
          ? json({ hits: 0, jobs: [] })
          : json({ jobs: [] })) as typeof fetch,
      async (url) => {
        pages.push(url)
        return '<html>No job data</html>'
      },
    )
    for (let i = 0; i < 6; i++) career.addSite(`https://employer${i}.example/careers`)
    const one = await career.search(profile, [])
    assert.equal(pages.length, 4)
    assert.equal(one.coverage.omittedQueries, 2)
    await career.search(profile, [])
    assert.equal(new Set(pages).size, 6)
    assert.ok(
      one.coverage.checks
        ?.filter((c) => c.name.startsWith('employer'))
        .every((c) => c.status === 'limited' && c.note.includes('unchecked')),
    )
  } finally {
    db.close()
  }
})
test('public HTTPS transport pins the checked address, refuses redirects, and bounds response bytes', async () => {
  const { EventEmitter } = await import('node:events')
  const { PassThrough } = await import('node:stream')
  const { request: httpsRequest } = await import('node:https')
  const resolver = async () => [{ address: '8.8.8.8', family: 4 }]
  let pinned: unknown
  const transport = (status: number, body: string) => (_url: any, options: any, receive: any) => {
    const req = new EventEmitter() as any
    req.end = () => {
      options.lookup('employer.example', { all: true }, (_error: any, value: any) => {
        pinned = value
      })
      queueMicrotask(() => {
        const res = new PassThrough() as any
        res.statusCode = status
        receive(res)
        res.end(body)
        req.emit('close')
      })
    }
    req.destroy = (error: Error) => {
      req.emit('error', error)
      req.emit('close')
    }
    return req
  }
  const result = await publicText(
    'https://employer.example/careers',
    resolver,
    transport(200, 'public jobs') as typeof httpsRequest,
  )
  assert.equal(result.text, 'public jobs')
  assert.deepEqual(pinned, [{ address: '8.8.8.8', family: 4 }])
  await assert.rejects(
    () =>
      publicText(
        'https://employer.example/careers',
        resolver,
        transport(302, '') as typeof httpsRequest,
      ),
    /redirects/,
  )
  await assert.rejects(
    () =>
      publicText(
        'https://employer.example/careers',
        resolver,
        transport(200, 'x'.repeat(2_000_001)) as typeof httpsRequest,
      ),
    /2 MB/,
  )
})
