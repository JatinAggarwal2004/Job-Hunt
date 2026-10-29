import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { randomUUID } from 'node:crypto'
import { createApp } from './app.ts'
import { createActivity } from './activity.ts'
const signup = (name: string) => ({
  name,
  email: `${name}@example.test`,
  password: 'Fictional QA passphrase 819363',
})
const beacon = (page = 'overview') => ({ id: randomUUID(), type: 'page_view', page, idleMs: 0 })
test('activity ownership, admin-only reads/settings, strict beacon schema and no usage inflation', async () => {
  const b = createApp({ dbPath: ':memory:', worker: false })
  try {
    const admin = request.agent(b.app),
      user = request.agent(b.app),
      other = request.agent(b.app)
    const owner = (await admin.post('/api/auth/register').send(signup('admin'))).body.user
    const u = (await user.post('/api/auth/register').send(signup('member'))).body.user
    await other.post('/api/auth/register').send(signup('other'))
    assert.equal((await request(b.app).post('/api/activity').send(beacon())).status, 401)
    assert.equal((await user.get('/api/admin/activity')).status, 403)
    assert.equal((await user.get(`/api/admin/activity/users/${u.id}`)).status, 403)
    assert.equal(
      (await user.patch('/api/admin/activity/settings').send({ enabled: false, retentionDays: 7 }))
        .status,
      403,
    )
    for (const forged of [
      { userId: 'other' },
      { totalRuns: 100 },
      { token: 'secret' },
      { at: 1 },
      { page: '/app?reset=secret' },
      { idleMs: -1 },
    ]) {
      assert.equal((await user.post('/api/activity').send({ ...beacon(), ...forged })).status, 400)
    }
    const d = beacon('resume')
    assert.equal((await user.post('/api/activity').send(d)).status, 204)
    assert.equal((await user.post('/api/activity').send(d)).status, 204)
    const result = (await admin.get(`/api/admin/activity/users/${u.id}`)).body
    assert.equal(result.events.filter((e: any) => e.action === 'workspace.page_view').length, 1)
    assert.equal(result.user.page, 'resume')
    assert.equal(result.user.active, true)
    assert.equal(result.user.totalRuns, 0)
    assert.equal(result.user.entitlements.freeRunsUsed, 0)
    assert.equal((await admin.get('/api/admin/activity?limit=101')).status, 400)
    assert.equal((await admin.get('/api/admin/activity?userId=other')).status, 400)
    assert.equal((await admin.get('/api/admin/activity?q=%25')).body.matchedUsers, 0)
    await user.post('/api/auth/logout')
    assert.equal(b.activity.detail(u.id)!.user.active, false)
    assert(b.activity.detail(u.id)!.user.lastSeen)
    await user.post('/api/auth/login').send(signup('member'))
    await admin.patch(`/api/admin/users/${u.id}/access`).send({ blocked: true })
    assert.equal((await user.post('/api/activity').send(beacon())).status, 403)
    const blocked = (await admin.get(`/api/admin/activity/users/${u.id}`)).body
    assert(
      blocked.events.some(
        (e: any) =>
          e.action === 'admin.access_changed' && e.actorId === owner.id && e.userId === u.id,
      ),
    )
  } finally {
    await b.close()
  }
})
test('run metrics and request IDs reflect real outcomes and link manual/scheduled scans without content', async () => {
  let fail = false
  const fetcher = (async () =>
    new Response(JSON.stringify(fail ? { error: 'source down' } : { data: [] }), {
      status: fail ? 503 : 200,
    })) as typeof fetch
  const b = createApp({ dbPath: ':memory:', worker: false, fetcher })
  try {
    const admin = request.agent(b.app),
      user = request.agent(b.app)
    await admin.post('/api/auth/register').send(signup('owner'))
    const u = (await user.post('/api/auth/register').send(signup('scanner'))).body.user
    const first = await user.post('/api/discovery/run?private_query=do_not_record')
    assert.equal(first.status, 202)
    await b.settle()
    fail = true
    await user.post('/api/discovery/run')
    await b.settle()
    fail = false
    b.runDiscovery(u.id, { trigger: 'scheduled' })
    await b.settle()
    const resume = await user.post('/api/resumes/text').send({
      filename: 'private-name.txt',
      text: 'Secret resume paragraph never belongs in analytics.',
    })
    assert.equal(resume.status, 201)
    assert.equal(
      (await user.post(`/api/resumes/${resume.body.resume.id}/analyze`).send({ useAi: true }))
        .status,
      402,
    )
    const detail = (await admin.get(`/api/admin/activity/users/${u.id}`)).body
    assert.deepEqual(
      [
        detail.user.totalRuns,
        detail.user.successfulRuns,
        detail.user.failedRuns,
        detail.user.runningRuns,
      ],
      [3, 2, 1, 0],
    )
    assert.equal(detail.user.entitlements.freeRunsUsed, 2)
    const manual = detail.runs.find((r: any) => r.id === first.body.run.id)
    assert.equal(manual.trigger, 'manual')
    assert.equal(manual.requestId, first.headers['x-request-id'])
    assert(detail.runs.some((r: any) => r.trigger === 'scheduled'))
    const finished = detail.events.find(
      (e: any) => e.action === 'discovery.completed' && e.resourceId === manual.id,
    )
    assert.equal(finished.requestId, manual.requestId)
    assert(detail.events.some((e: any) => e.action === 'resume.created' && e.status === 201))
    assert(
      detail.events.some((e: any) => e.action === 'resume.ai_draft_requested' && e.status === 402),
    )
    assert.equal(detail.user.aiAttempts, 0)
    assert(!JSON.stringify(detail.events).includes('Secret resume'))
    assert(!JSON.stringify(detail.events).includes('private-name'))
    assert(!JSON.stringify(detail.events).includes('private_query'))
    const next = (await admin.get(`/api/admin/activity/users/${u.id}?limit=1&offset=1`)).body
    assert.equal(next.runs.length, 1)
    assert.equal(next.events.length, 1)
    const single = (await admin.get(`/api/admin/activity/users/${u.id}?limit=1`)).body
    assert.notEqual(next.events[0].id, single.events[0].id)
    const all = (await admin.get('/api/admin/activity')).body
    assert.equal(all.totalRuns, 3)
    assert.equal(all.totalUsers, 2)
    assert.equal(all.users.find((r: any) => r.name === 'owner').totalRuns, 0)
    const exported = (await user.get('/api/account/export')).body
    assert(Array.isArray(exported.activity))
    assert.equal(exported.activityExportLimit, 10000)
  } finally {
    await b.close()
  }
})
test('presence expires after missed heartbeats, hidden/idle tabs are offline, retention prunes events but not run totals', async () => {
  const b = createApp({ dbPath: ':memory:', worker: false })
  try {
    const admin = request.agent(b.app)
    const u = (await admin.post('/api/auth/register').send(signup('presence'))).body.user
    let time = Date.now()
    const a = createActivity(b.db, b.billing.summary, () => time)
    a.ingest(u.id, beacon())
    assert.equal(a.detail(u.id)!.user.active, true)
    time += 90001
    assert.equal(a.detail(u.id)!.user.active, false)
    a.ingest(u.id, { ...beacon(), idleMs: 300000 })
    assert.equal(a.detail(u.id)!.user.active, false)
    a.ingest(u.id, { ...beacon(), type: 'inactive' })
    assert.equal(a.detail(u.id)!.user.active, false)
    a.ingest(u.id, beacon())
    assert.equal(a.overview().activeUsers, 1)
    const hiddenTab = randomUUID()
    a.ingest(u.id, { ...beacon(), tabId: hiddenTab, type: 'inactive' })
    assert.equal(a.overview().activeUsers, 1, 'a hidden tab must not hide an active workspace')
    a.ingest(u.id, { ...beacon(), type: 'inactive' })
    assert.equal(a.overview().activeUsers, 0, 'all tabs inactive means offline')
    a.ingest(u.id, beacon())
    a.context('historical-run', 'manual')
    b.db.prepare('INSERT INTO runs VALUES(?,?,?)').run(
      'historical-run',
      u.id,
      JSON.stringify({
        id: 'historical-run',
        status: 'completed',
        startedAt: new Date(time).toISOString(),
        finishedAt: new Date(time).toISOString(),
        jobsFound: 2,
        error: null,
      }),
    )
    time += 8 * 86400000
    a.record(u.id, 'discovery.completed', { resourceId: 'historical-run' })
    assert.equal(
      (await admin.patch('/api/admin/activity/settings').send({ enabled: false, retentionDays: 7 }))
        .status,
      200,
    )
    // Exercise retention with deterministic server time, independent of wall clock.
    a.prune(true)
    assert.equal(a.detail(u.id)!.events.length, 1)
    assert.equal(a.detail(u.id)!.user.totalRuns, 1)
    assert.equal(a.overview().activeUsers, 0)
    const before = a.detail(u.id)!.eventTotal
    a.ingest(u.id, beacon('billing'))
    assert.equal(a.detail(u.id)!.eventTotal, before)
    assert.equal(
      (await admin.patch('/api/admin/activity/settings').send({ enabled: true, retentionDays: 6 }))
        .status,
      400,
    )
  } finally {
    await b.close()
  }
})
