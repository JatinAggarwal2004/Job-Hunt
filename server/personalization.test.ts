import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp } from './app.ts'
import { extractProfile } from './profile-extraction.ts'
import { reviewResume } from './job-review.ts'
import { employerDeadline } from './deadlines.ts'
import { semanticReviews, semanticContext } from './semantic-review.ts'
import type { Job, Profile, Resume } from '../shared/types.ts'
const text =
  'Example Candidate\nemail@example.test\n+91 9876543210\nLocation: Bengaluru\nhttps://www.linkedin.com/in/example\nSkills: Java, Spring Boot, PostgreSQL, SQL\nExperience\nBuilt Java REST APIs and Spring Boot payment services using PostgreSQL.\nProjects\nTested APIs and reduced request latency with SQL query tuning.\nEducation\nComputer Science degree.'
const resume = {
  id: 'r',
  filename: 'Backend.txt',
  text,
  createdAt: new Date().toISOString(),
  analysis: null,
} as Resume
const profile = {
  skills: ['Java'],
  roles: ['Software Engineer'],
  locations: ['India'],
  remoteOnly: false,
  experienceLevels: [],
  salaryMin: 0,
  includeUnknownSalary: true,
  companySizes: [],
} as unknown as Profile
const job = {
  id: 'j',
  title: 'Software Engineer',
  company: 'Example Employer',
  location: 'India',
  remote: false,
  url: 'https://employer.example/jobs/j',
  description:
    'Build Java and Spring Boot REST APIs with PostgreSQL and SQL. Requirements: project experience with backend services.',
  source: 's',
  postedAt: null,
  fetchedAt: new Date().toISOString(),
  salaryMin: null,
  salaryMax: null,
  currency: null,
  companySize: null,
  matchScore: 100,
  matchReasons: [],
  status: null,
} as Job
async function fixture() {
  const backend = createApp({
    dbPath: ':memory:',
    worker: false,
    env: { ENABLE_SEMANTIC_MODEL: 'false' },
  })
  const a = request.agent(backend.app),
    b = request.agent(backend.app)
  for (const [agent, email] of [
    [a, 'a@example.test'],
    [b, 'b@example.test'],
  ] as const) {
    assert.equal(
      (
        await agent
          .post('/api/auth/register')
          .send({ name: 'Fixture', email, password: 'Fixture only passphrase 2026!' })
      ).status,
      201,
    )
  }
  const users = backend.db.prepare('SELECT id,email FROM users ORDER BY rowid').all() as {
    id: string
    email: string
  }[]
  const source = JSON.parse(
    (backend.db.prepare('SELECT data FROM sources LIMIT 1').get() as any).data,
  )
  const insert = (value: Job, owner = users[0].id) => {
    const j = { ...value, source: source.id }
    backend.db.prepare('INSERT INTO jobs VALUES(?,?)').run(j.id, JSON.stringify(j))
    backend.db.prepare('INSERT INTO discovered_jobs VALUES(?,?)').run(owner, j.id)
    backend.retrieval.index(j)
    return j
  }
  const p = (await a.get('/api/profile')).body
  await a
    .put('/api/profile')
    .send({ ...p, roles: profile.roles, locations: profile.locations, skills: profile.skills })
  return { backend, a, b, users, insert }
}
test('resume extraction proposes actual fields and literal skills without inventing missing dates or experience', () => {
  const parsed = extractProfile(resume)
  assert.ok(parsed.fields.some((f) => f.key === 'name' && f.value === 'Example Candidate'))
  assert.ok(parsed.fields.some((f) => f.key === 'phone' && f.value.includes('9876543210')))
  assert.ok(parsed.fields.every((f) => resume.text.includes(f.value)))
  assert.ok(parsed.skills.includes('Java'))
  assert.ok(!parsed.skills.includes('Python'))
  assert.deepEqual(
    extractProfile({ ...resume, text: 'Projects\nA generic project with no contact fields.' })
      .fields,
    [],
  )
})
test('job-specific review rewards relevant evidence and quotes only actual job/resume text', () => {
  const fit = reviewResume(resume, job, profile),
    other = reviewResume(
      {
        ...resume,
        text: 'Skills: Photoshop and Content Marketing\nProjects\nDesigned advertisements and created social media content.\nEducation\nMarketing degree.',
      },
      job,
      profile,
    )
  assert.ok(fit.score! > other.score!)
  assert.ok(fit.matchedSkills.some((s) => s.skill === 'Java'))
  assert.ok(
    fit.matchedSkills.every(
      (s) =>
        resume.text.replace(/\s+/g, ' ').includes(s.resumeEvidence) &&
        job.description.includes(s.jobEvidence),
    ),
  )
  assert.equal(reviewResume(resume, { ...job, description: '' }, profile).score, null)
  const changed = reviewResume(
    resume,
    { ...job, description: 'Use Python and Django for backend data processing.' },
    profile,
  )
  assert.ok(changed.missingSkills.some((s) => s.skill === 'Python'))
  assert.ok(!changed.matchedSkills.some((s) => s.skill === 'Java'))
})
test('profile extraction is review-only, applies chosen fields and preserves unselected details and account ownership', async () => {
  const { backend, a, b } = await fixture()
  try {
    const r = (await a.post('/api/resumes/text').send({ text, filename: 'Fixture.txt' })).body
      .resume
    const before = (await a.get('/api/profile')).body
    const result = await a.get(`/api/resumes/${r.id}/extract`)
    assert.equal(result.status, 200)
    assert.deepEqual((await a.get('/api/profile')).body, before)
    assert.equal((await b.get(`/api/resumes/${r.id}/extract`)).status, 404)
    assert.equal(
      (await b.post(`/api/resumes/${r.id}/apply-profile`).send({ fields: ['email'] })).status,
      404,
    )
    const applied = await a
      .post(`/api/resumes/${r.id}/apply-profile`)
      .send({ fields: ['phone'], includeSkills: true })
    assert.equal(applied.status, 200)
    assert.equal(applied.body.profile.email, before.email)
    assert.ok(applied.body.profile.phone.includes('9876543210'))
    assert.equal(applied.body.profile.salaryMin, before.salaryMin)
    assert.ok(applied.body.profile.skills.includes('PostgreSQL'))
    assert.equal(
      (await a.post(`/api/resumes/${r.id}/apply-profile`).send({ fields: ['role'] })).status,
      400,
    )
  } finally {
    await backend.close()
  }
})
test('every match beyond100 can be reached by pagination without duplicates or another account jobs', async () => {
  const { backend, a, b, users, insert } = await fixture()
  try {
    for (let i = 0; i < 145; i++)
      insert({
        ...job,
        id: `j${i}`,
        url: `https://employer.example/jobs/${i}`,
        title: `Software Engineer ${i}`,
      })
    insert({ ...job, id: 'foreign', url: 'https://other.example/jobs/foreign' }, users[1].id)
    const seen = new Set<string>()
    let offset: number | null = 0
    while (offset !== null) {
      const r = await a.get(`/api/jobs?limit=36&offset=${offset}`)
      assert.equal(r.status, 200)
      assert.equal(r.body.total, 145)
      for (const j of r.body.jobs) {
        assert.ok(!seen.has(j.id))
        seen.add(j.id)
      }
      offset = r.body.nextOffset
    }
    assert.equal(seen.size, 145)
    assert.equal((await b.get('/api/jobs')).body.total, 1)
    for (const q of ['offset=-1', 'offset=2.5', 'limit=0', 'limit=201'])
      assert.equal((await a.get('/api/jobs?' + q)).status, 400)
  } finally {
    await backend.close()
  }
})
test('retrieval returns citations from eligible owned jobs, handles malicious query syntax and does not leak foreign content', async () => {
  const { backend, a, b, users, insert } = await fixture()
  try {
    insert(job)
    insert(
      {
        ...job,
        id: 'hidden',
        description: 'Secret Pineapple HiringProject',
        url: 'https://other.example/hidden',
      },
      users[1].id,
    )
    insert({
      ...job,
      id: 'unrelated',
      title: 'Marketing Manager',
      description: 'Java ad copy',
      url: 'https://employer.example/marketing',
    })
    const r = await a.post('/api/assistant/query').send({ question: 'Java Spring backend' })
    assert.equal(r.status, 200)
    assert.ok(r.body.evidence.length > 0)
    assert.ok(r.body.evidence.every((e: any) => e.jobId === 'j' && e.url === job.url))
    const none = await a
      .post('/api/assistant/query')
      .send({ question: 'Secret Pineapple HiringProject' })
    assert.equal(none.body.evidence.length, 0)
    assert.equal(
      (await b.post('/api/assistant/query').send({ question: 'Java', jobId: 'j' })).status,
      404,
    )
    assert.equal(
      (await a.post('/api/assistant/query').send({ question: '" OR * - title:secret' })).status,
      200,
    )
    assert.equal(
      (await a.post('/api/assistant/query').send({ question: 'Java', useAi: true })).status,
      503,
    )
  } finally {
    await backend.close()
  }
})
test('comparison uses selected owned versions, ranks per job and rejects foreign jobs and resume IDs', async () => {
  const { backend, a, b, users, insert } = await fixture()
  try {
    insert(job)
    const good = (await a.post('/api/resumes/text').send({ text, filename: 'Backend.txt' })).body
      .resume
    const other = (
      await a.post('/api/resumes/text').send({
        text: 'Photoshop designer and marketing specialist. Projects in advertising campaigns and graphic design.',
        filename: 'Design.txt',
      })
    ).body.resume
    const foreign = (await b.post('/api/resumes/text').send({ text, filename: 'Private.txt' })).body
      .resume
    const result = await a
      .post('/api/jobs/j/compare-resumes')
      .send({ resumeIds: [other.id, good.id] })
    assert.equal(result.status, 200)
    assert.equal(result.body.reviews[0].resumeId, good.id)
    assert.equal(result.body.reviews[0].engine, 'evidence_rules')
    assert.equal(
      (await a.post('/api/jobs/j/compare-resumes').send({ resumeIds: [good.id, foreign.id] }))
        .status,
      404,
    )
    assert.equal(
      (await b.post('/api/jobs/j/compare-resumes').send({ resumeIds: [foreign.id] })).status,
      404,
    )
    assert.equal((await a.post('/api/jobs/j/compare-resumes').send({ resumeIds: [] })).status, 400)
    assert.equal(
      (await a.post('/api/jobs/j/compare-resumes').send({ resumeIds: Array(6).fill(good.id) }))
        .status,
      400,
    )
    assert.equal(
      (await a.get('/api/resumes')).body.resumes.find((r: any) => r.id === good.id).text,
      text,
    )
  } finally {
    await backend.close()
  }
})
test('deadline parsing preserves explicit source dates and never guesses expiry from posting dates or relative text', () => {
  assert.equal(employerDeadline(undefined, 'Posted2026-11-01. Apply soon.'), null)
  assert.equal(employerDeadline(undefined, 'Application deadline:2099-11-30'), '2099-11-30')
  assert.equal(employerDeadline('2026-02-30'), null)
  assert.equal(employerDeadline('2099-11-30T18:30:00+05:30'), '2099-11-30T13:00:00.000Z')
})
test('deadline alerts are private, date-validated, idempotent and automatically created only for exact saved-job expiry', async () => {
  const { backend, a, b, insert } = await fixture()
  try {
    insert({ ...job, deadlineAt: new Date(Date.now() + 86400000 * 3).toISOString() })
    const save = await a.post('/api/applications').send({ jobId: 'j', status: 'saved' })
    assert.equal(save.status, 200)
    assert.equal((await a.get('/api/alerts')).body.alerts.length, 1)
    const data = {
      jobId: 'j',
      deadlineAt: new Date(Date.now() + 86400000 * 3).toISOString(),
      remindAt: new Date(Date.now() - 1000).toISOString(),
      emailEnabled: false,
    }
    const alert = (await a.post('/api/alerts').send(data)).body.alert
    assert.ok(alert.id)
    assert.equal((await a.post('/api/alerts').send(data)).body.alert.id, alert.id)
    assert.equal((await b.get('/api/alerts')).body.alerts.length, 0)
    assert.equal((await b.delete(`/api/alerts/${alert.id}`)).status, 404)
    assert.equal(
      (await a.post('/api/alerts').send({ ...data, deadlineAt: '2000-01-01T00:00:00Z' })).status,
      400,
    )
    assert.equal((await a.post('/api/alerts').send({ ...data, emailEnabled: true })).status, 403)
    assert.equal((await a.patch(`/api/alerts/${alert.id}`).send({ read: true })).status, 200)
    assert.ok((await a.get('/api/alerts')).body.alerts[0].readAt)
    assert.equal((await a.delete(`/api/alerts/${alert.id}`)).status, 200)
  } finally {
    await backend.close()
  }
})
test('semantic scoring and retrieval preserve source IDs and append a separately explained model dimension', async () => {
  const review = reviewResume(resume, job, profile)
  const encode = async (texts: string[]) => texts.map(() => [1, 0, 0])
  const result = await semanticReviews('user', job, [resume], [review], encode)
  assert.equal(result[0].engine, 'minilm_evidence')
  assert.ok(result[0].semanticEvidence?.every((e) => resume.text.includes(e.resumeQuote)))
  const context = await semanticContext(
    'u',
    'Java',
    {
      answer: 'x',
      engine: 'retrieval',
      evidence: [{ id: 'old', jobId: 'j', title: job.title, url: job.url, quote: job.description }],
      notice: '',
    },
    encode,
  )
  assert.equal(context.engine, 'minilm_retrieval')
  assert.equal(context.evidence[0].id, 'S1')
  assert.equal(context.evidence[0].jobId, 'j')
})
test('semantic retrieval with no related evidence stays empty; resume evidence can come from later sections', async () => {
  const unrelated = await semanticContext(
    'u',
    'Java backend',
    {
      answer: 'candidate',
      engine: 'retrieval',
      notice: '',
      evidence: [
        {
          id: 'old',
          jobId: 'j',
          title: job.title,
          url: job.url,
          quote: 'Marketing and advertising campaigns.',
        },
      ],
    },
    async () => [
      [1, 0],
      [0, 1],
    ],
  )
  assert.equal(unrelated.evidence.length, 0)
  assert.match(unrelated.answer, /No sufficiently related/)
  const longResume = {
    ...resume,
    text:
      'Introductory material. '.repeat(170) +
      '\nJava Spring Boot PostgreSQL REST APIs backend services project experience.',
  }
  const result = await semanticReviews(
    'u',
    job,
    [longResume],
    [reviewResume(longResume, job, profile)],
    async (texts) => texts.map((t) => (t.includes('Spring Boot') ? [1, 0] : [0, 1])),
  )
  assert.ok(result[0].semanticEvidence?.some((e) => e.resumeQuote.includes('Spring Boot')))
})
test('an unavailable semantic model never presents unrelated candidate passages as lexical evidence', async () => {
  const { backend, a, insert } = await fixture()
  try {
    insert(job)
    backend.semantic.status = () => ({
      enabled: true,
      model: 'fixture',
      revision: 'fixture',
      state: 'unavailable',
    })
    backend.semantic.encode = async () => {
      throw Error('Fixture unavailable')
    }
    const result = await a.post('/api/assistant/query').send({ question: 'Zoology palaeontology' })
    assert.equal(result.status, 200)
    assert.deepEqual(result.body.evidence, [])
    assert.match(result.body.answer, /No lexical evidence/)
  } finally {
    await backend.close()
  }
})
