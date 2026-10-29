import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { activityPages } from '../shared/activity.ts'
import type { ActivityAccount, ActivityEvent, ActivitySettings } from '../shared/activity.ts'
import type { Entitlements } from '../shared/billing.ts'
import type { Run } from '../shared/types.ts'
const ACTIVE_MS = 5 * 60000
const HEARTBEAT_GRACE_MS = 90000
const DAY_MS = 86400000
const actions: Record<string, string> = {
  'POST /auth/register': 'account.created',
  'POST /auth/login': 'account.signed_in',
  'POST /auth/logout': 'account.signed_out',
  'PUT /profile': 'profile.saved',
  'POST /discovery/run': 'discovery.requested',
  'POST /resumes/upload': 'resume.uploaded',
  'POST /resumes/text': 'resume.created',
  'PATCH /resumes/:id': 'resume.saved',
  'DELETE /resumes/:id': 'resume.deleted',
  'POST /resumes/:id/analyze': 'resume.reviewed',
  'PATCH /resumes/:id/suggestions/:suggestionId': 'resume.suggestion_changed',
  'DELETE /applications/:id': 'application.deleted',
  'POST /applications': 'application.saved',
  'PATCH /applications/:id': 'application.updated',
  'POST /extension/token': 'assistant.connected',
  'DELETE /extension/token': 'assistant.revoked',
  'GET /extension/profile': 'assistant.profile_read',
  'GET /account/export': 'account.exported',
  'POST /billing/checkout': 'billing.checkout_requested',
  'POST /billing/cancel': 'billing.cancellation_requested',
  'POST /billing/reconcile': 'billing.status_checked',
  'PATCH /admin/settings': 'admin.settings_changed',
  'POST /admin/sources': 'admin.source_created',
  'PATCH /admin/sources/:id': 'admin.source_changed',
  'DELETE /admin/sources/:id': 'admin.source_removed',
  'PATCH /admin/monetization': 'admin.pricing_changed',
  'PUT /admin/complimentary/:userId': 'admin.complimentary_changed',
  'PATCH /admin/users/:id/access': 'admin.access_changed',
  'PATCH /admin/activity/settings': 'admin.activity_settings_changed',
  'POST /auth/send-verification': 'account.verification_requested',
  'POST /auth/verify': 'account.email_verified',
  'POST /auth/reset': 'account.password_reset',
}
type Row = Record<string, any>
export function createActivity(
  db: DatabaseSync,
  access: (id: string) => Entitlements,
  clock = Date.now,
) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_settings(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL,retention_days INTEGER NOT NULL);
    INSERT OR IGNORE INTO activity_settings VALUES(1,1,90);
    CREATE TABLE IF NOT EXISTS activity_presence(user_id TEXT PRIMARY KEY,last_seen INTEGER NOT NULL,page TEXT NOT NULL,last_input INTEGER NOT NULL DEFAULT 0,visible INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS activity_events(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,at INTEGER NOT NULL,source TEXT NOT NULL,action TEXT NOT NULL,page TEXT,resource_id TEXT,request_id TEXT,status INTEGER,actor_id TEXT);
    CREATE INDEX IF NOT EXISTS activity_events_user_time ON activity_events(user_id,at DESC,id DESC);
    CREATE INDEX IF NOT EXISTS activity_events_time ON activity_events(at);
    CREATE TABLE IF NOT EXISTS activity_tabs(user_id TEXT NOT NULL,tab_id TEXT NOT NULL,last_seen INTEGER NOT NULL,page TEXT NOT NULL,last_input INTEGER NOT NULL,visible INTEGER NOT NULL,PRIMARY KEY(user_id,tab_id));
    CREATE TABLE IF NOT EXISTS activity_run_context(run_id TEXT PRIMARY KEY,trigger TEXT NOT NULL,request_id TEXT);
  `)
  const columns = db.prepare('PRAGMA table_info(activity_presence)').all() as { name: string }[]
  if (!columns.some((c) => c.name === 'last_input'))
    db.exec('ALTER TABLE activity_presence ADD COLUMN last_input INTEGER NOT NULL DEFAULT 0')
  if (!columns.some((c) => c.name === 'visible'))
    db.exec('ALTER TABLE activity_presence ADD COLUMN visible INTEGER NOT NULL DEFAULT 0')
  const eventColumns = db.prepare('PRAGMA table_info(activity_events)').all() as { name: string }[]
  if (!eventColumns.some((c) => c.name === 'actor_id'))
    db.exec('ALTER TABLE activity_events ADD COLUMN actor_id TEXT')
  db.exec(
    'CREATE INDEX IF NOT EXISTS activity_events_actor_time ON activity_events(actor_id,at DESC,id DESC)',
  )
  const settings = (): ActivitySettings => {
    const s = db.prepare('SELECT * FROM activity_settings WHERE id=1').get() as Row
    return { enabled: !!s.enabled, retentionDays: s.retention_days }
  }
  let lastPruned = -Infinity
  function prune(force = false) {
    if (!force && clock() - lastPruned < 3600000) return
    const cutoff = clock() - settings().retentionDays * DAY_MS
    db.prepare('DELETE FROM activity_events WHERE at<?').run(cutoff)
    db.prepare('DELETE FROM activity_presence WHERE last_seen<?').run(cutoff)
    db.prepare('DELETE FROM activity_tabs WHERE last_seen<?').run(clock() - DAY_MS)
    lastPruned = clock()
  }
  function record(
    userId: string,
    action: string,
    fields: {
      id?: string
      actorId?: string
      source?: 'browser' | 'server'
      page?: string
      resourceId?: string
      requestId?: string
      status?: number
    } = {},
  ) {
    prune()
    db.prepare('INSERT OR IGNORE INTO activity_events VALUES(?,?,?,?,?,?,?,?,?,?)').run(
      fields.id || randomUUID(),
      userId,
      clock(),
      fields.source || 'server',
      action,
      fields.page || null,
      fields.resourceId || null,
      fields.requestId || null,
      fields.status ?? null,
      fields.actorId || userId,
    )
  }
  const context = (runId: string, trigger: string, requestId?: string) =>
    db
      .prepare('INSERT OR IGNORE INTO activity_run_context VALUES(?,?,?)')
      .run(runId, trigger, requestId || null)
  function recordRun(userId: string, run: Run) {
    const c = db.prepare('SELECT * FROM activity_run_context WHERE run_id=?').get(run.id) as
      Row | undefined
    record(userId, `discovery.${run.status}`, {
      resourceId: run.id,
      requestId: c?.request_id || undefined,
    })
  }
  const middleware = (req: Request, res: Response, next: NextFunction) => {
    const requestId = randomUUID()
    res.locals.activityRequestId = requestId
    res.setHeader('X-Request-Id', requestId)
    res.on('finish', () => {
      const userId = res.locals.activityUserId || (req as any).user?.id
      const path = typeof req.route?.path === 'string' ? req.route.path.replace(/^\/api/, '') : ''
      const action =
        res.locals.activityAction ||
        actions[`${req.method} ${path}`] ||
        Object.entries(actions).find(([key]) => {
          const [method, pattern] = key.split(' ')
          return (
            method === req.method &&
            new RegExp('^' + pattern.replace(/:[^/]+/g, '[^/]+') + '$').test(
              req.path.replace(/^\/api/, ''),
            )
          )
        })?.[1]
      if (!userId || !action) return
      // Deliberately no raw URL/query, request/response bodies, headers, IP or error text.
      try {
        const resource = res.locals.activityResourceId || req.params.id || req.params.userId
        const target =
          ['admin.access_changed', 'admin.complimentary_changed'].includes(action) &&
          typeof resource === 'string' &&
          db.prepare('SELECT 1 FROM users WHERE id=?').get(resource)
            ? resource
            : userId
        record(target, action, {
          actorId: userId,
          requestId,
          status: res.statusCode,
          resourceId:
            typeof resource === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(resource)
              ? resource
              : undefined,
        })
        if (action === 'account.signed_out' && res.statusCode < 400) {
          db.prepare('UPDATE activity_presence SET visible=0 WHERE user_id=?').run(userId)
          db.prepare('UPDATE activity_tabs SET visible=0 WHERE user_id=?').run(userId)
        }
      } catch {
        console.error('Activity record failed; inspect database health.')
      }
    })
    next()
  }
  const pageEvent = z
    .object({
      id: z.string().uuid(),
      tabId: z.string().uuid().optional(),
      type: z.enum(['page_view', 'heartbeat', 'inactive']),
      page: z.enum(activityPages),
      idleMs: z.number().int().min(0).max(ACTIVE_MS).default(0),
    })
    .strict()
  function ingest(userId: string, body: unknown) {
    const d = pageEvent.parse(body)
    if (!settings().enabled) return
    prune()
    db.prepare(
      'INSERT INTO activity_tabs VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,tab_id) DO UPDATE SET last_seen=excluded.last_seen,page=excluded.page,last_input=excluded.last_input,visible=excluded.visible',
    ).run(
      userId,
      d.tabId || 'legacy',
      clock(),
      d.page,
      clock() - d.idleMs,
      d.type === 'inactive' ? 0 : 1,
    )
    // Bound tab rows and let a visible tab keep the account online when another is hidden.
    db.prepare(
      'DELETE FROM activity_tabs WHERE user_id=? AND tab_id NOT IN (SELECT tab_id FROM activity_tabs WHERE user_id=? ORDER BY last_seen DESC,tab_id LIMIT 20)',
    ).run(userId, userId)
    const current = db
      .prepare(
        'SELECT * FROM activity_tabs WHERE user_id=? ORDER BY (visible=1 AND last_seen>=? AND last_input>?) DESC,last_seen DESC,tab_id LIMIT 1',
      )
      .get(userId, clock() - HEARTBEAT_GRACE_MS, clock() - ACTIVE_MS) as Row
    db.prepare(
      'INSERT INTO activity_presence VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET last_seen=excluded.last_seen,page=excluded.page,last_input=excluded.last_input,visible=excluded.visible',
    ).run(userId, current.last_seen, current.page, current.last_input, current.visible)
    if (d.type === 'page_view')
      record(userId, 'workspace.page_view', { id: d.id, source: 'browser', page: d.page })
  }
  const totalsSql = `SELECT user_id,COUNT(*) total,SUM(CASE WHEN json_extract(data,'$.status') IN ('completed','partial') THEN 1 ELSE 0 END) successful,SUM(CASE WHEN json_extract(data,'$.status')='failed' THEN 1 ELSE 0 END) failed,SUM(CASE WHEN json_extract(data,'$.status')='running' THEN 1 ELSE 0 END) running,COALESCE(SUM(json_extract(data,'$.jobsFound')),0) jobs FROM runs GROUP BY user_id`
  const usersSql = `SELECT u.id,u.name,u.email,u.role,p.last_seen,p.page,p.last_input,p.visible,COALESCE(r.total,0) total,COALESCE(r.successful,0) successful,COALESCE(r.failed,0) failed,COALESCE(r.running,0) running,COALESCE(r.jobs,0) jobs,COALESCE(a.attempts,0) ai FROM users u LEFT JOIN activity_presence p ON p.user_id=u.id LEFT JOIN (${totalsSql}) r ON r.user_id=u.id LEFT JOIN (SELECT user_id,SUM(attempts) attempts FROM ai_usage GROUP BY user_id) a ON a.user_id=u.id`
  function account(r: Row): ActivityAccount {
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      active:
        settings().enabled &&
        r.last_seen != null &&
        r.last_seen >= clock() - HEARTBEAT_GRACE_MS &&
        r.visible === 1 &&
        r.last_input > clock() - ACTIVE_MS,
      lastSeen: r.last_seen != null ? new Date(r.last_seen).toISOString() : null,
      page: r.page || null,
      totalRuns: r.total,
      successfulRuns: r.successful,
      failedRuns: r.failed,
      runningRuns: r.running,
      jobsFound: r.jobs,
      aiAttempts: r.ai,
      entitlements: access(r.id),
    }
  }
  function overview(q = '', offset = 0, limit = 25) {
    prune()
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`
    const where =
      " WHERE u.id LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\'"
    const users = (
      db
        .prepare(usersSql + where + ' ORDER BY COALESCE(p.last_seen,0) DESC,u.id LIMIT ? OFFSET ?')
        .all(like, like, like, limit, offset) as Row[]
    ).map(account)
    return {
      settings: settings(),
      activeWindowSeconds: ACTIVE_MS / 1000,
      heartbeatGraceSeconds: HEARTBEAT_GRACE_MS / 1000,
      totalUsers: (db.prepare('SELECT COUNT(*) n FROM users').get() as Row).n,
      activeUsers: settings().enabled
        ? (
            db
              .prepare(
                'SELECT COUNT(*) n FROM activity_presence WHERE last_seen>=? AND visible=1 AND last_input>?',
              )
              .get(clock() - HEARTBEAT_GRACE_MS, clock() - ACTIVE_MS) as Row
          ).n
        : 0,
      totalRuns: (db.prepare('SELECT COUNT(*) n FROM runs').get() as Row).n,
      users,
      offset,
      limit,
      matchedUsers: (
        db.prepare('SELECT COUNT(*) n FROM users u' + where).get(like, like, like) as Row
      ).n,
    }
  }
  const event = (r: Row): ActivityEvent => ({
    id: r.id,
    userId: r.user_id,
    actorId: r.actor_id || r.user_id,
    at: new Date(r.at).toISOString(),
    source: r.source,
    action: r.action,
    page: r.page,
    resourceId: r.resource_id,
    requestId: r.request_id,
    status: r.status,
  })
  function detail(id: string, offset = 0, limit = 25) {
    prune()
    const r = db.prepare(usersSql + ' WHERE u.id=?').get(id) as Row | undefined
    if (!r) return null
    const events = (
      db
        .prepare(
          'SELECT * FROM activity_events WHERE user_id=? OR actor_id=? ORDER BY at DESC,id DESC LIMIT ? OFFSET ?',
        )
        .all(id, id, limit, offset) as Row[]
    ).map(event)
    const runs = (
      db
        .prepare(
          "SELECT r.data,c.trigger,c.request_id FROM runs r LEFT JOIN activity_run_context c ON c.run_id=r.id WHERE r.user_id=? ORDER BY json_extract(r.data,'$.startedAt') DESC,r.id DESC LIMIT ? OFFSET ?",
        )
        .all(id, limit, offset) as Row[]
    ).map((r) => ({
      ...JSON.parse(r.data),
      trigger: r.trigger || 'historical / unknown',
      requestId: r.request_id,
    }))
    return {
      user: account(r),
      events,
      runs,
      eventTotal: (
        db
          .prepare('SELECT COUNT(*) n FROM activity_events WHERE user_id=? OR actor_id=?')
          .get(id, id) as Row
      ).n,
      runTotal: r.total,
      offset,
      limit,
      retentionDays: settings().retentionDays,
    }
  }
  const router = express.Router()
  const wrap =
    (fn: (req: Request, res: Response) => unknown) =>
    (req: Request, res: Response, next: NextFunction) =>
      Promise.resolve()
        .then(() => fn(req, res))
        .catch(next)
  const admin = (req: Request, res: Response, next: NextFunction) =>
    (req as any).user?.role === 'admin'
      ? next()
      : res.status(403).json({ error: 'Administrator access required' })
  const pagination = z.object({
    offset: z.coerce.number().int().min(0).max(1000000).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  router.post(
    '/activity',
    wrap((req, res) => {
      ingest((req as any).user.id, req.body)
      res.sendStatus(204)
    }),
  )
  router.get(
    '/admin/activity',
    admin,
    wrap((req, res) => {
      const d = pagination
        .extend({ q: z.string().max(100).default('') })
        .strict()
        .parse(req.query)
      res.json(overview(d.q, d.offset, d.limit))
    }),
  )
  router.get(
    '/admin/activity/users/:id',
    admin,
    wrap((req, res) => {
      const { offset, limit } = pagination.strict().parse(req.query)
      const d = detail(String(req.params.id), offset, limit)
      if (!d) return res.status(404).json({ error: 'Account not found' })
      res.json(d)
    }),
  )
  router.patch(
    '/admin/activity/settings',
    admin,
    wrap((req, res) => {
      const d = z
        .object({ enabled: z.boolean(), retentionDays: z.number().int().min(7).max(365) })
        .strict()
        .parse(req.body)
      db.prepare('UPDATE activity_settings SET enabled=?,retention_days=? WHERE id=1').run(
        d.enabled ? 1 : 0,
        d.retentionDays,
      )
      if (!d.enabled) db.exec('DELETE FROM activity_presence; DELETE FROM activity_tabs')
      prune(true)
      res.json(settings())
    }),
  )
  prune(true)
  return {
    router,
    middleware,
    settings,
    record,
    recordRun,
    context,
    ingest,
    overview,
    detail,
    prune,
  }
}
