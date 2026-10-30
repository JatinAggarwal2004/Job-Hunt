import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp } from './app.ts'
import { match, type RawJob } from './sources.ts'
import { suggestedSkills, uniqueChoices } from '../shared/profile-options.ts'
import type { Profile } from '../shared/types.ts'
const registration = (name: string) => ({
  name,
  email: `${name}@example.test`,
  password: 'Local fixture passphrase 2026!',
})
test('new accounts have zero personal opportunities even with populated global catalogue; scans and tracking are owned', async () => {
  let round = 0
  const backend = createApp({
    dbPath: ':memory:',
    worker: false,
    fetcher: (async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              title: 'Software Engineer',
              company_name: 'Employer',
              location: 'Bengaluru, India',
              url: `https://employer.example/jobs/${round}`,
            },
          ],
        }),
      )) as typeof fetch,
  })
  try {
    const a = request.agent(backend.app),
      b = request.agent(backend.app)
    await a.post('/api/auth/register').send(registration('Existing'))
    await a.post('/api/discovery/run')
    await backend.settle()
    const own = (await a.get('/api/jobs')).body.jobs[0]
    assert.ok(own)
    await a.post('/api/applications').send({ jobId: own.id, status: 'saved' })
    await b.post('/api/auth/register').send(registration('Brandnew'))
    assert.equal((await b.get('/api/bootstrap')).body.overview.jobs, 0)
    assert.equal((await b.get('/api/jobs')).body.total, 0)
    assert.equal((await b.get(`/api/jobs/${own.id}`)).status, 404)
    assert.equal(
      (await b.post('/api/applications').send({ jobId: own.id, status: 'saved' })).status,
      404,
    )
    round++
    await b.post('/api/discovery/run')
    await backend.settle()
    assert.equal((await b.get('/api/jobs')).body.total, 1)
    assert.equal((await b.get('/api/bootstrap')).body.overview.jobs, 1)
    assert.equal((await a.get('/api/applications')).body.applications[0].job.id, own.id)
    assert.equal(
      (await a.get('/api/jobs')).body.jobs.some((job: any) => job.url.endsWith('/1')),
      false,
    )
  } finally {
    await backend.close()
  }
})
test('multi-location and experience preferences save/reload; legacy experience string remains accepted', async () => {
  const backend = createApp({ dbPath: ':memory:', worker: false })
  try {
    const a = request.agent(backend.app)
    await a.post('/api/auth/register').send(registration('Profile'))
    const p = (await a.get('/api/profile')).body
    const selected = {
      ...p,
      roles: ['Backend Engineer', 'QA Engineer'],
      skills: ['Java', 'API testing'],
      locations: ['India', 'Bengaluru', 'Hyderabad'],
      experience: 'Internship',
      experienceLevels: ['Internship', 'Entry level'],
    }
    assert.equal((await a.put('/api/profile').send(selected)).status, 200)
    assert.deepEqual((await a.get('/api/profile')).body, selected)
    const legacy = { ...selected }
    delete legacy.experienceLevels
    assert.equal((await a.put('/api/profile').send(legacy)).status, 200)
    assert.equal(
      (await a.put('/api/profile').send({ ...selected, experienceLevels: ['Invented Level'] }))
        .status,
      400,
    )
  } finally {
    await backend.close()
  }
})
test('experience choices use OR semantics, unknown levels remain eligible, Indian location aliases match', () => {
  const p = {
    roles: [],
    skills: [],
    locations: ['Bengaluru'],
    remoteOnly: false,
    experience: 'Internship',
    experienceLevels: ['Internship', 'Entry level'],
    salaryMin: 0,
    includeUnknownSalary: true,
    companySizes: [],
  } as unknown as Profile
  const job = {
    title: 'Engineering Intern',
    description: '',
    location: 'Bangalore, India',
    remote: false,
    salaryMin: null,
    companySize: null,
  } as RawJob
  assert.equal(match(job, p).eligible, true)
  assert.equal(match({ ...job, title: 'Junior Engineer' }, p).eligible, true)
  assert.equal(match({ ...job, title: 'Senior Engineer' }, p).eligible, false)
  assert.equal(match({ ...job, title: 'Software Engineer' }, p).eligible, true)
  assert.equal(
    match(
      { ...job, title: 'Senior Engineer' },
      { ...p, experienceLevels: ['Internship', 'Senior'] },
    ).eligible,
    true,
  )
  assert.equal(
    match({ ...job, location: 'Gurgaon, India' }, { ...p, locations: ['Gurugram'] }).eligible,
    true,
  )
  assert.equal(match({ ...job, location: 'London, UK' }, p).eligible, false)
  assert.equal(
    match({ ...job, location: 'Noida, India' }, { ...p, locations: ['Gurugram'] }).eligible,
    false,
  )
  assert.equal(
    match({ ...job, location: 'Noida, India' }, { ...p, locations: ['Delhi NCR'] }).eligible,
    true,
  )
})
test('role suggestions are contextual examples and choice dedup preserves custom values', () => {
  assert.ok(suggestedSkills(['Frontend Engineer']).includes('React'))
  assert.ok(!suggestedSkills(['Product Designer']).includes('React'))
  assert.ok(suggestedSkills(['Product Designer']).includes('Figma'))
  assert.deepEqual(suggestedSkills(['Custom unknown role']), [])
  assert.deepEqual(uniqueChoices([' Java ', 'java', 'Special skill', '']), [
    'java',
    'Special skill',
  ])
})
