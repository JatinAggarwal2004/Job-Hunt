import express from 'express'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { createActivity } from './activity.ts'
import { createBilling } from './billing.ts'
import { accountSecurity, type MailSender } from './accounts.ts'
import { runtimeConfig } from './config.ts'
import { durableDatabasePath } from './storage.ts'
import type { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import { extractResume } from './documents.ts'
import { acquireWorkerLease } from './lease.ts'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import { mkdirSync, chmodSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { scheduleParts, nextDailyRun } from './schedule.ts'
import { createIntelligence } from './intelligence.ts'
import { z } from 'zod'
import type {
  User,
  Profile,
  Job,
  Source,
  Settings,
  Run,
  Resume,
  Application,
  ApplicationStatus,
} from '../shared/types.ts'
import { collect, match, limitedJson } from './sources.ts'
import { analyze } from './resume.ts'
const now = () => new Date().toISOString()
const hash = (s: string) => createHash('sha256').update(s).digest('hex')
const defaults: Settings = {
  brandName: 'Job-Hunter',
  accentColor: '#F3D86A',
  discoveryEnabled: true,
  maxJobsPerSource: 300,
  aiEnabled: false,
  ollamaModel: '',
  aiProvider: 'ollama',
  aiModel: '',
  aiDailyLimit: 20,
  aiConsentRequired: true,
}
const profileDefault = (u: User): Profile => ({
  name: u.name,
  email: u.email,
  phone: '',
  location: '',
  website: '',
  linkedin: '',
  summary: '',
  skills: [],
  roles: [],
  locations: [],
  remoteOnly: false,
  experience: '',
  salaryMin: 0,
  currency: 'INR',
  includeUnknownSalary: true,
  companySizes: [],
  scheduleEnabled: false,
  scheduleHour: 9,
  timezone: 'Asia/Kolkata',
})
const strings = z.array(z.string().trim().min(1).max(100)).max(50)
const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.string().email().max(254),
    phone: z.string().max(40),
    location: z.string().max(200),
    website: z
      .string()
      .max(500)
      .refine((s) => !s || /^https?:\/\//.test(s)),
    linkedin: z
      .string()
      .max(500)
      .refine((s) => !s || /^https?:\/\//.test(s)),
    summary: z.string().max(10000),
    skills: strings,
    roles: strings,
    locations: strings,
    remoteOnly: z.boolean(),
    experience: z.string().max(100),
    salaryMin: z.number().min(0).max(1e10),
    currency: z.string().regex(/^[A-Z]{3}$/),
    includeUnknownSalary: z.boolean(),
    companySizes: strings,
    scheduleEnabled: z.boolean(),
    scheduleHour: z.number().int().min(0).max(23),
    timezone: z
      .string()
      .max(100)
      .refine((s) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: s })
          return true
        } catch {
          return false
        }
      }),
  })
  .strict()
const statusSchema = z.enum(['saved', 'preparing', 'applied', 'interview', 'offer', 'rejected'])
const textSchema = z.object({
  text: z.string().min(20).max(100000),
  filename: z.string().max(200).optional(),
})
const settingsSchema = z
  .object({
    brandName: z.string().trim().min(1).max(80),
    accentColor: z.string().regex(/^#[a-fA-F0-9]{6}$/),
    discoveryEnabled: z.boolean(),
    maxJobsPerSource: z.number().int().min(1).max(500),
    aiEnabled: z.boolean(),
    aiProvider: z.enum(['ollama', 'gemini']),
    aiModel: z
      .string()
      .max(100)
      .regex(/^[a-zA-Z0-9_.:-]*$/),
    aiDailyLimit: z.number().int().min(1).max(1000),
    aiConsentRequired: z.boolean(),
    ollamaModel: z
      .string()
      .max(100)
      .regex(/^[a-zA-Z0-9_.:/-]*$/),
  })
  .partial()
  .strict()
const sourceSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    type: z.enum(['arbeitnow', 'greenhouse', 'lever', 'ashby']),
    slug: z.string().regex(/^[a-zA-Z0-9_-]{0,100}$/),
    enabled: z.boolean(),
  })
  .strict()
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
export function createApp(
  options: {
    dbPath?: string
    fetcher?: typeof fetch
    worker?: boolean
    env?: NodeJS.ProcessEnv
    sendMail?: MailSender
    mailFetcher?: typeof fetch
  } = {},
) {
  const env = options.env || process.env,
    config = runtimeConfig(env)
  const path = durableDatabasePath(
    options.dbPath || env.JOB_HUNTER_DB || 'data/job-hunter.sqlite',
    env,
  )
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(path)
  db.exec(`PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS system_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,password TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS profiles(user_id TEXT PRIMARY KEY REFERENCES users(id),data TEXT NOT NULL,last_schedule TEXT);
 CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS resumes(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS applications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),job_id TEXT NOT NULL REFERENCES jobs(id),status TEXT NOT NULL,notes TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(user_id,job_id));
 CREATE TABLE IF NOT EXISTS extension_tokens(user_id TEXT PRIMARY KEY REFERENCES users(id),token TEXT NOT NULL,expires INTEGER NOT NULL);`)
  if (path !== ':memory:')
    for (const file of [path, path + '-wal', path + '-shm'])
      if (existsSync(file)) chmodSync(file, 0o600)
  db.prepare('INSERT OR IGNORE INTO settings VALUES(1,?)').run(JSON.stringify(defaults))
  if (
    !db.prepare("SELECT key FROM system_meta WHERE key='sources-initialized'").get() &&
    !db.prepare('SELECT id FROM sources LIMIT 1').get()
  ) {
    const s: Source = {
      id: randomUUID(),
      name: 'Arbeitnow',
      type: 'arbeitnow',
      slug: '',
      enabled: true,
      lastRun: null,
      lastError: null,
      jobCount: 0,
    }
    db.prepare('INSERT INTO sources VALUES(?,?)').run(s.id, JSON.stringify(s))
  }
  db.prepare("INSERT OR IGNORE INTO system_meta VALUES('sources-initialized','yes')").run()
  const getSettings = () =>
    JSON.parse((db.prepare('SELECT data FROM settings WHERE id=1').get() as any).data) as Settings
  const getProfile = (id: string) =>
    JSON.parse(
      (db.prepare('SELECT data FROM profiles WHERE user_id=?').get(id) as any).data,
    ) as Profile
  const listSources = () =>
    db
      .prepare('SELECT data FROM sources')
      .all()
      .map((r: any) => JSON.parse(r.data) as Source)
  const lease = options.worker === false ? null : acquireWorkerLease(db)
  const accounts = accountSecurity(db, {
    env,
    sendMail: options.sendMail,
    mailFetcher: options.mailFetcher,
  })
  const billing = createBilling(db, { fetcher: options.fetcher, env })
  billing.recoverReservations()
  const intelligence = createIntelligence(db, { env, fetcher: options.fetcher })
  const activity = createActivity(db, billing.summary)
  const userFrom = (row: any): User => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    emailVerified: Boolean(row.email_verified),
  })
  const saveRun = (user: string, run: Run) => {
    db.prepare('INSERT OR REPLACE INTO runs VALUES(?,?,?)').run(run.id, user, JSON.stringify(run))
    activity.recordRun(user, run)
  }
  for (const row of db.prepare('SELECT * FROM runs').all() as any[]) {
    const run: Run = JSON.parse(row.data)
    if (run.status === 'running') {
      run.status = 'failed'
      run.error = 'Server restarted before collection finished'
      run.finishedAt = now()
      saveRun(row.user_id, run)
    }
  }
  let closed = false
  const active = new Map<string, Run>()
  const pending = new Set<Promise<void>>()
  const fetcher = options.fetcher || fetch
  const runDiscovery = (uid: string, context: { trigger?: string; requestId?: string } = {}) => {
    if (lease && !lease.valid())
      throw new HttpError(503, 'The worker lease was lost. Restart this instance safely.')
    if (!getSettings().discoveryEnabled)
      throw new HttpError(409, 'Discovery is disabled by the administrator')
    billing.guard(uid, 'access')
    if (active.has(uid)) return active.get(uid)!
    billing.guard(uid, 'discover')
    if (active.size >= 2) throw new HttpError(429, 'Discovery capacity reached; try again shortly')
    const run: Run = {
      id: randomUUID(),
      status: 'running',
      startedAt: now(),
      finishedAt: null,
      jobsFound: 0,
      error: null,
    }
    billing.reserveDiscovery(uid, run.id)
    activity.context(run.id, context.trigger || 'manual', context.requestId)
    active.set(uid, run)
    saveRun(uid, run)
    const work = (async () => {
      const errors: string[] = []
      let successes = 0
      const found = new Set<string>()
      const sources = listSources().filter((s) => s.enabled)
      for (const source of sources) {
        if (closed) break
        try {
          const jobs = await collect(source, getSettings().maxJobsPerSource, fetcher)
          if (closed) break
          const foundIds = new Set(jobs.map((j) => j.id))
          for (const row of db.prepare('SELECT id,data FROM jobs').all() as any[]) {
            const old = JSON.parse(row.data)
            if (old.source === source.id && !foundIds.has(old.id)) {
              old.available = false
              db.prepare('UPDATE jobs SET data=? WHERE id=?').run(JSON.stringify(old), row.id)
            }
          }
          for (const job of jobs) {
            db.prepare('INSERT OR REPLACE INTO jobs VALUES(?,?)').run(
              job.id,
              JSON.stringify({ ...job, available: true }),
            )
            found.add(job.id)
          }
          source.jobCount = jobs.length
          source.lastError = null
          successes++
        } catch (e) {
          source.lastError = (e as Error).message
          errors.push(`${source.name}: ${source.lastError}`)
        }
        if (!closed) {
          const current = listSources().find((s) => s.id === source.id)
          if (current) {
            current.lastRun = now()
            current.lastError = source.lastError
            current.jobCount = source.jobCount
            db.prepare('UPDATE sources SET data=? WHERE id=?').run(
              JSON.stringify(current),
              source.id,
            )
          }
        }
      }
      if (!closed) {
        run.jobsFound = found.size
        run.status = errors.length
          ? successes
            ? 'partial'
            : 'failed'
          : sources.length
            ? 'completed'
            : 'failed'
        run.error = errors.join('; ') || (!sources.length ? 'No enabled sources' : null)
        run.finishedAt = now()
        billing.settleDiscovery(run.id, run.status === 'completed' || run.status === 'partial')
        saveRun(uid, run)
      }
      active.delete(uid)
    })()
    pending.add(work)
    work.finally(() => pending.delete(work))
    return run
  }
  const getRuns = (uid?: string) =>
    (uid
      ? db.prepare('SELECT data FROM runs WHERE user_id=? ORDER BY rowid DESC LIMIT 50').all(uid)
      : db.prepare('SELECT data FROM runs ORDER BY rowid DESC LIMIT 100').all()
    ).map((r: any) => JSON.parse(r.data) as Run)
  const decorate = (raw: any, uid: string): Job => {
    const job = typeof raw === 'string' ? JSON.parse(raw) : raw
    const m = match(job, getProfile(uid))
    const a = db
      .prepare('SELECT status FROM applications WHERE user_id=? AND job_id=?')
      .get(uid, job.id) as any
    return { ...job, matchScore: m.score, matchReasons: m.reasons, status: a?.status || null }
  }
  const jobById = (id: string, uid: string) => {
    const row = db.prepare('SELECT data FROM jobs WHERE id=?').get(id) as any
    if (!row) throw new HttpError(404, 'Job not found')
    return decorate(row.data, uid)
  }
  const application = (row: any): Application => ({
    id: row.id,
    job: jobById(row.job_id, row.user_id),
    status: row.status,
    notes: row.notes,
    updatedAt: row.updated_at,
  })
  const resumeById = (id: string, uid: string): Resume => {
    const row = db.prepare('SELECT data FROM resumes WHERE id=? AND user_id=?').get(id, uid) as any
    if (!row) throw new HttpError(404, 'Resume not found')
    return JSON.parse(row.data)
  }
  const saveResume = (r: Resume, uid: string) => {
    db.prepare('INSERT OR REPLACE INTO resumes VALUES(?,?,?)').run(r.id, uid, JSON.stringify(r))
    return r
  }
  const aiStatus = () => intelligence.status(getSettings())
  const app = express()
  app.disable('x-powered-by')
  if (config.trustProxy) app.set('trust proxy', config.trustProxy)
  app.use(
    helmet({
      contentSecurityPolicy: config.production
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:'],
              connectSrc: ["'self'"],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
              formAction: ["'self'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
      hsts: config.production ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  )
  app.use(activity.middleware)
  app.post(
    '/api/billing/webhook',
    express.raw({ type: 'application/json', limit: '256kb' }),
    billing.webhook,
  )
  app.use(express.json({ limit: '150kb' }))
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'no-store')
    const host = req.hostname
    if (!(
      host === config.hostname ||
      (!config.production && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host)) ||
      req.path === '/api/health' ||
      req.path === '/api/ready'
    ))
      return res.status(403).json({ error: 'Untrusted request host' })
    const origin = req.headers.origin
    if (req.path === '/api/extension/profile' && origin?.startsWith('chrome-extension://')) {
      if (!/^chrome-extension:\/\/[a-p]{32}$/.test(origin))
        return res.status(403).json({ error: 'Invalid extension origin' })
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Headers', 'Authorization')
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
      if (req.method === 'OPTIONS') return res.sendStatus(204)
    } else if (origin) {
      if (!config.origins.has(origin))
        return res.status(403).json({ error: 'Untrusted request origin' })
    }
    next()
  })
  const route =
    (fn: (req: Request, res: Response) => unknown) =>
    (req: Request, res: Response, next: NextFunction) =>
      Promise.resolve()
        .then(() => fn(req, res))
        .catch(next)
  const uid = (req: Request) => (req as any).user.id as string
  const auth = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('jh_session='))
      ?.slice(11)
    const row = token
      ? db
          .prepare(
            'SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?',
          )
          .get(hash(token), Date.now())
      : null
    if (!row) return res.status(401).json({ error: 'Sign in to continue' })
    ;(req as any).user = userFrom(row)
    next()
  }
  const admin = (req: Request, res: Response, next: NextFunction) => {
    if ((req as any).user.role !== 'admin')
      return res.status(403).json({ error: 'Administrator access required' })
    next()
  }
  const verificationGuard = (req: Request, res: Response, next: NextFunction) => {
    if (config.requireVerification && !(req as any).user.emailVerified)
      return res.status(403).json({
        error: 'Verify your email before using this feature.',
        code: 'EMAIL_VERIFICATION_REQUIRED',
      })
    next()
  }
  const securityLimiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many account requests. Try again in 15 minutes.' },
  })
  app.use('/api/auth/request-reset', securityLimiter)
  app.use('/api/auth/reset', securityLimiter)
  app.use('/api/auth/verify', securityLimiter)
  app.use('/api', accounts.publicRouter)
  const session = (res: Response, id: string) => {
    res.locals.activityUserId = id
    const token = randomBytes(32).toString('hex')
    db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now())
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token), id, Date.now() + 7 * 86400000)
    res.cookie('jh_session', token, {
      httpOnly: true,
      secure: config.production,
      sameSite: 'strict',
      maxAge: 7 * 86400000,
      path: '/',
    })
  }
  const throttle = rateLimit({
    windowMs: 15 * 60000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' },
  })
  app.get('/api/ready', (_req, res) => {
    const missing: string[] = []
    if (config.production && !accounts.mailReady) missing.push('email_delivery')
    if (config.production && billing.settings().mode === 'paid' && !billing.checkoutReady())
      missing.push('payment_gateway')
    if (!existsSync(resolve('dist/index.html'))) missing.push('frontend_build')
    res.status(missing.length ? 503 : 200).json({
      ready: !missing.length,
      missing: [...new Set(missing)],
      deployment: config.production ? 'production' : 'local',
      paymentsConfigured: billing.checkoutReady(),
      aiEnabled: getSettings().aiEnabled,
    })
  })
  app.get('/api/health', (_req, res) => res.json({ ok: true }))
  app.post(
    '/api/auth/register',
    throttle,
    route(async (req, res) => {
      if (config.requireVerification && !accounts.mailReady)
        throw new HttpError(503, 'Email delivery must be configured before registration can open.')
      const input = z
        .object({
          name: z.string().trim().min(1).max(100),
          email: z.string().trim().email().max(254),
          password: z.string().min(10).max(128),
        })
        .strict()
        .parse(req.body)
      const email = input.email.toLowerCase()
      if (db.prepare('SELECT id FROM users WHERE email=?').get(email))
        throw new HttpError(409, 'An account with this email already exists')
      const salt = randomBytes(16).toString('hex')
      const password = salt + ':' + scryptSync(input.password, salt, 64).toString('hex')
      const user: User = {
        id: randomUUID(),
        name: input.name,
        email,
        role: config.bootstrapEmail
          ? email === config.bootstrapEmail
            ? 'admin'
            : 'user'
          : db.prepare('SELECT id FROM users LIMIT 1').get()
            ? 'user'
            : 'admin',
      }
      db.exec('BEGIN')
      try {
        db.prepare('INSERT INTO users(id,email,name,role,password) VALUES(?,?,?,?,?)').run(
          user.id,
          email,
          user.name,
          user.role,
          password,
        )
        db.prepare('INSERT INTO profiles(user_id,data) VALUES(?,?)').run(
          user.id,
          JSON.stringify(profileDefault(user)),
        )
        db.exec('COMMIT')
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
      session(res, user.id)
      let verificationMessage = ''
      if (accounts.mailReady)
        try {
          await accounts.issue(user, 'verify')
          verificationMessage = 'Check your email to verify your account.'
        } catch {
          verificationMessage =
            'Verification email could not be sent. Use resend verification in your workspace.'
        }
      res.status(201).json({ user, verificationMessage })
    }),
  )
  app.post(
    '/api/auth/login',
    throttle,
    route((req, res) => {
      const input = z
        .object({ email: z.string().email().max(254), password: z.string().max(128) })
        .parse(req.body)
      const row = db
        .prepare('SELECT * FROM users WHERE email=?')
        .get(input.email.toLowerCase()) as any
      const [salt, key] = (
        row?.password || '00000000000000000000000000000000:' + '0'.repeat(128)
      ).split(':')
      const valid = timingSafeEqual(scryptSync(input.password, salt, 64), Buffer.from(key, 'hex'))
      if (!row || !valid) throw new HttpError(401, 'Incorrect email or password')
      session(res, row.id)
      res.json({ user: userFrom(row) })
    }),
  )
  app.post(
    '/api/auth/logout',
    auth,
    route((req, res) => {
      const token = req.headers.cookie
        ?.split(';')
        .map((s) => s.trim())
        .find((s) => s.startsWith('jh_session='))
        ?.slice(11)
      if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(hash(token))
      res.clearCookie('jh_session', { path: '/' }).json({ ok: true })
    }),
  )
  app.get(
    '/api/extension/profile',
    route((req, res) => {
      const token = req.headers.authorization?.replace(/^Bearer /, '')
      const row = token
        ? (db
            .prepare('SELECT user_id FROM extension_tokens WHERE token=? AND expires>?')
            .get(hash(token), Date.now()) as any)
        : null
      if (!row) throw new HttpError(401, 'Invalid or expired extension token')
      res.locals.activityUserId = row.user_id
      billing.guard(row.user_id, 'extension')
      const owner = db
        .prepare('SELECT email_verified FROM users WHERE id=?')
        .get(row.user_id) as any
      if (config.requireVerification && !owner.email_verified)
        throw new HttpError(403, 'Email verification is required')
      const p = getProfile(row.user_id)
      res.json({
        profile: {
          name: p.name,
          email: p.email,
          phone: p.phone,
          location: p.location,
          website: p.website,
          linkedin: p.linkedin,
        },
      })
    }),
  )
  app.use('/api', auth)
  app.use('/api/auth/send-verification', securityLimiter)
  app.use('/api', accounts.privateRouter)
  app.use('/api/billing/checkout', verificationGuard)
  app.use('/api/admin', verificationGuard)
  app.use('/api', billing.router)
  app.use('/api', (req, res, next) => {
    if (['/bootstrap', '/auth/me'].includes(req.path)) return next()
    try {
      billing.guard(uid(req), 'access')
      return verificationGuard(req, res, next)
    } catch (e) {
      next(e)
    }
  })
  app.use(
    '/api/activity',
    rateLimit({
      windowMs: 60000,
      limit: 30,
      keyGenerator: (req) => (req as any).user.id,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many activity updates' },
    }),
  )
  app.use('/api', activity.router)
  app.get('/api/auth/me', (req, res) => res.json({ user: (req as any).user }))
  app.get('/api/profile', (req, res) => res.json(getProfile(uid(req))))
  app.put(
    '/api/profile',
    route((req, res) => {
      const p = profileSchema.parse(req.body)
      if (p.scheduleEnabled) billing.guard(uid(req), 'schedule')
      db.prepare('UPDATE profiles SET data=? WHERE user_id=?').run(JSON.stringify(p), uid(req))
      res.json(p)
    }),
  )
  app.get('/api/settings', (_req, res) => res.json({ settings: getSettings() }))
  app.get('/api/sources', (_req, res) => res.json({ sources: listSources() }))
  app.get(
    '/api/ai/status',
    route(async (_req, res) => res.json(await aiStatus())),
  )
  app.get(
    '/api/jobs',
    route((req, res) => {
      const p = getProfile(uid(req))
      let jobs = db
        .prepare('SELECT data FROM jobs')
        .all()
        .map((r: any) => decorate(r.data, uid(req)))
        .filter(
          (j) =>
            j.available !== false &&
            listSources().some((s) => s.id === j.source && s.enabled) &&
            match(j, p).eligible,
        )
      if (req.query.q) {
        const q = String(req.query.q).toLowerCase().slice(0, 200)
        jobs = jobs.filter((j) =>
          `${j.title} ${j.company} ${j.description}`.toLowerCase().includes(q),
        )
      }
      if (req.query.remote === 'true') jobs = jobs.filter((j) => j.remote)
      if (req.query.source) jobs = jobs.filter((j) => j.source === req.query.source)
      if (req.query.saved === 'true') jobs = jobs.filter((j) => !!j.status)
      jobs.sort((a, b) => b.matchScore - a.matchScore || b.fetchedAt.localeCompare(a.fetchedAt))
      const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100))
      res.json({ jobs: jobs.slice(0, limit), total: jobs.length })
    }),
  )
  app.get(
    '/api/jobs/:id',
    route((req, res) => res.json({ job: jobById(String(req.params.id), uid(req)) })),
  )
  app.post(
    '/api/discovery/run',
    route((req, res) => {
      const run = runDiscovery(uid(req), {
        trigger: 'manual',
        requestId: res.locals.activityRequestId,
      })
      res.locals.activityResourceId = run.id
      res.status(202).json({ run })
    }),
  )
  app.get('/api/discovery/runs', (req, res) => res.json({ runs: getRuns(uid(req)) }))
  app.get('/api/applications', (req, res) =>
    res.json({
      applications: db
        .prepare('SELECT * FROM applications WHERE user_id=? ORDER BY updated_at DESC')
        .all(uid(req))
        .map(application),
    }),
  )
  app.post(
    '/api/applications',
    route((req, res) => {
      const { jobId, status } = z
        .object({ jobId: z.string(), status: statusSchema })
        .parse(req.body)
      jobById(jobId, uid(req))
      const prior = db
        .prepare('SELECT id FROM applications WHERE user_id=? AND job_id=?')
        .get(uid(req), jobId) as any
      const id = prior?.id || randomUUID()
      db.prepare(
        'INSERT INTO applications VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,job_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at',
      ).run(id, uid(req), jobId, status, '', now())
      res.json({
        application: application(db.prepare('SELECT * FROM applications WHERE id=?').get(id)),
      })
    }),
  )
  app.patch(
    '/api/applications/:id',
    route((req, res) => {
      const row = db
        .prepare('SELECT * FROM applications WHERE id=? AND user_id=?')
        .get(String(req.params.id), uid(req)) as any
      if (!row) throw new HttpError(404, 'Application not found')
      const input = z
        .object({ status: statusSchema.optional(), notes: z.string().max(10000).optional() })
        .strict()
        .parse(req.body)
      db.prepare('UPDATE applications SET status=?,notes=?,updated_at=? WHERE id=?').run(
        input.status || row.status,
        input.notes ?? row.notes,
        now(),
        row.id,
      )
      res.json({
        application: application(db.prepare('SELECT * FROM applications WHERE id=?').get(row.id)),
      })
    }),
  )
  app.delete(
    '/api/applications/:id',
    route((req, res) => {
      const r = db
        .prepare('DELETE FROM applications WHERE id=? AND user_id=?')
        .run(String(req.params.id), uid(req))
      if (!r.changes) throw new HttpError(404, 'Application not found')
      res.json({ ok: true })
    }),
  )
  const createResume = (text: string, filename: string, user: string) => {
    textSchema.parse({ text })
    if ((db.prepare('SELECT count(*) AS n FROM resumes WHERE user_id=?').get(user) as any).n >= 20)
      throw new HttpError(409, 'Maximum 20 resumes. Delete an old version first.')
    return saveResume({ id: randomUUID(), filename, text, createdAt: now(), analysis: null }, user)
  }
  app.get('/api/resumes', (req, res) =>
    res.json({
      resumes: db
        .prepare('SELECT data FROM resumes WHERE user_id=? ORDER BY rowid DESC')
        .all(uid(req))
        .map((r: any) => JSON.parse(r.data)),
    }),
  )
  app.post(
    '/api/resumes/text',
    route((req, res) => {
      const p = textSchema.parse(req.body)
      res.status(201).json({ resume: createResume(p.text, p.filename || 'Resume.txt', uid(req)) })
    }),
  )
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
  })
  app.post(
    '/api/resumes/upload',
    upload.single('file'),
    route(async (req, res) => {
      const f = req.file
      if (!f) throw new HttpError(400, 'Select a PDF, DOCX or TXT file')
      const filename = f.originalname.replace(/[\\/\x00-\x1f]/g, '_').slice(0, 200)
      const text = await extractResume(f.buffer, filename, uid(req))
      res.status(201).json({ resume: createResume(text.slice(0, 100000), filename, uid(req)) })
    }),
  )
  app.patch(
    '/api/resumes/:id',
    route((req, res) => {
      const r = resumeById(String(req.params.id), uid(req))
      r.text = textSchema.parse(req.body).text
      r.analysis = null
      res.json({ resume: saveResume(r, uid(req)) })
    }),
  )
  app.delete(
    '/api/resumes/:id',
    route((req, res) => {
      resumeById(String(req.params.id), uid(req))
      db.prepare('DELETE FROM resumes WHERE id=? AND user_id=?').run(
        String(req.params.id),
        uid(req),
      )
      res.json({ ok: true })
    }),
  )
  app.post(
    '/api/resumes/:id/analyze',
    route(async (req, res) => {
      const r = resumeById(String(req.params.id), uid(req))
      const {
        jobId,
        useAi = false,
        consent = false,
      } = z
        .object({
          jobId: z.string().optional(),
          useAi: z.boolean().optional(),
          consent: z.boolean().optional(),
        })
        .strict()
        .parse(req.body || {})
      const jobDescription = jobId ? jobById(jobId, uid(req)).description : ''
      r.analysis = analyze(r.text, getProfile(uid(req)), jobDescription)
      if (useAi) {
        res.locals.activityAction = 'resume.ai_draft_requested'
        billing.guard(uid(req), 'ai')
        r.analysis = await intelligence.run(uid(req), r.analysis, r.text, getSettings(), {
          consent,
          jobDescription,
        })
      }
      if (resumeById(r.id, uid(req)).text !== r.text)
        throw new HttpError(
          409,
          'Resume changed during analysis. Review your latest text and analyze again.',
        )
      res.json({ resume: saveResume(r, uid(req)) })
    }),
  )
  app.patch(
    '/api/resumes/:id/suggestions/:suggestionId',
    route((req, res) => {
      const { status } = z
        .object({ status: z.enum(['accepted', 'rejected', 'pending']) })
        .strict()
        .parse(req.body)
      const r = resumeById(String(req.params.id), uid(req))
      const s = r.analysis?.suggestions.find((s) => s.id === req.params.suggestionId)
      if (!s) throw new HttpError(404, 'Suggestion not found')
      if (status === 'accepted' && s.status !== 'accepted' && s.before && s.after) {
        if (!r.text.includes(s.before))
          throw new HttpError(409, 'Original text changed. Analyze again.')
        r.text = r.text.replace(s.before, s.after)
      }
      if (s.status === 'accepted' && status !== 'accepted' && s.before && s.after) {
        if (!r.text.includes(s.after))
          throw new HttpError(409, 'Edited text changed. Restore it manually.')
        r.text = r.text.replace(s.after, s.before)
      }
      s.status = status
      res.json({ resume: saveResume(r, uid(req)) })
    }),
  )
  app.post(
    '/api/extension/token',
    route((req, res) => {
      billing.guard(uid(req), 'extension')
      const token = randomBytes(32).toString('hex')
      db.prepare('INSERT OR REPLACE INTO extension_tokens VALUES(?,?,?)').run(
        uid(req),
        hash(token),
        Date.now() + 30 * 86400000,
      )
      res.json({ token })
    }),
  )
  app.delete(
    '/api/extension/token',
    route((req, res) => {
      db.prepare('DELETE FROM extension_tokens WHERE user_id=?').run(uid(req))
      res.json({ ok: true })
    }),
  )
  app.use('/api/admin', admin)
  app.get('/api/admin', (_req, res) =>
    res.json({
      users: db.prepare('SELECT * FROM users').all().map(userFrom),
      sources: listSources(),
      runs: getRuns(),
      settings: getSettings(),
    }),
  )
  app.patch(
    '/api/admin/settings',
    route((req, res) => {
      const settings = { ...getSettings(), ...settingsSchema.parse(req.body) }
      db.prepare('UPDATE settings SET data=? WHERE id=1').run(JSON.stringify(settings))
      res.json({ settings })
    }),
  )
  app.post(
    '/api/admin/sources',
    route((req, res) => {
      const p = sourceSchema.parse(req.body)
      if (p.type !== 'arbeitnow' && !p.slug)
        throw new HttpError(400, 'Board identifier is required')
      if (listSources().some((s) => s.type === p.type && s.slug === p.slug))
        throw new HttpError(409, 'Source already exists')
      if (listSources().length >= 50) throw new HttpError(409, 'Maximum 50 sources')
      const source: Source = { ...p, id: randomUUID(), lastRun: null, lastError: null, jobCount: 0 }
      db.prepare('INSERT INTO sources VALUES(?,?)').run(source.id, JSON.stringify(source))
      res.status(201).json({ source })
    }),
  )
  app.patch(
    '/api/admin/sources/:id',
    route((req, res) => {
      const source = listSources().find((s) => s.id === req.params.id)
      if (!source) throw new HttpError(404, 'Source not found')
      const p = sourceSchema
        .pick({ enabled: true, name: true, slug: true })
        .partial()
        .parse(req.body)
      Object.assign(source, p)
      if (source.type !== 'arbeitnow' && !source.slug)
        throw new HttpError(400, 'Board identifier is required')
      db.prepare('UPDATE sources SET data=? WHERE id=?').run(JSON.stringify(source), source.id)
      res.json({ source })
    }),
  )
  app.delete(
    '/api/admin/sources/:id',
    route((req, res) => {
      const r = db.prepare('DELETE FROM sources WHERE id=?').run(String(req.params.id))
      if (!r.changes) throw new HttpError(404, 'Source not found')
      res.json({ ok: true })
    }),
  )
  app.get(
    '/api/bootstrap',
    route(async (req, res) => {
      const user = (req as any).user as User
      const p = getProfile(user.id)
      const apps = db
        .prepare('SELECT status FROM applications WHERE user_id=?')
        .all(user.id) as any[]
      const jobs = db
        .prepare('SELECT data FROM jobs')
        .all()
        .filter((r: any) => {
          const job = JSON.parse(r.data)
          return (
            job.available !== false &&
            listSources().some((s) => s.id === job.source && s.enabled) &&
            match(job, p).eligible
          )
        }).length
      res.json({
        user,
        profile: p,
        overview: {
          jobs,
          saved: apps.filter((a) => a.status === 'saved').length,
          applied: apps.filter((a) => ['applied', 'interview', 'offer'].includes(a.status)).length,
          interviews: apps.filter((a) => a.status === 'interview').length,
          lastRun: getRuns(user.id)[0] || null,
          nextRun:
            getSettings().discoveryEnabled && billing.summary(user.id).canSchedule
              ? nextDailyRun(
                  p,
                  (
                    db
                      .prepare('SELECT last_schedule FROM profiles WHERE user_id=?')
                      .get(user.id) as any
                  ).last_schedule,
                )
              : null,
        },
        settings: getSettings(),
        ai: await aiStatus(),
        entitlements: billing.summary(user.id),
        emailVerificationRequired: config.requireVerification,
        activity: activity.settings(),
      })
    }),
  )
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found' }))
  const dist = resolve('dist')
  if (existsSync(dist)) {
    app.use(express.static(dist, { index: false }))
    app.get(['/', '/app', '/app/*path'], (_req, res) => res.sendFile(resolve(dist, 'index.html')))
  }
  app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError)
      return res
        .status(400)
        .json({ error: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') })
    if (error instanceof multer.MulterError)
      return res
        .status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
        .json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'File exceeds 5 MB' : error.message })
    if (error.type === 'entity.too.large')
      return res.status(413).json({ error: 'Request is too large' })
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON' })
    res.status(error.status || 500).json({
      code: error.code || undefined,
      error: error.status
        ? error.message
        : 'Unable to complete the request. Check the file or try again.',
    })
  })
  const tick = (time = new Date()) => {
    if (!closed) activity.prune()
    if (closed || (lease && !lease.valid()) || !getSettings().discoveryEnabled) return
    for (const row of db.prepare('SELECT * FROM profiles').all() as any[]) {
      const p: Profile = JSON.parse(row.data)
      if (!p.scheduleEnabled) continue
      try {
        billing.guard(row.user_id, 'schedule')
        const owner = db
          .prepare('SELECT email_verified FROM users WHERE id=?')
          .get(row.user_id) as any
        if (config.requireVerification && !owner.email_verified) continue
      } catch {
        continue
      }
      const part = scheduleParts(p, time)
      if (part.hour >= p.scheduleHour && row.last_schedule !== part.day) {
        try {
          runDiscovery(row.user_id, { trigger: 'scheduled' })
          db.prepare('UPDATE profiles SET last_schedule=? WHERE user_id=?').run(
            part.day,
            row.user_id,
          )
        } catch {}
      }
    }
  }
  const timer = options.worker === false ? null : setInterval(tick, 30000)
  timer?.unref()
  if (options.worker !== false) tick()
  return {
    app,
    db,
    tick,
    runDiscovery,
    intelligence,
    activity,
    billing,
    accounts,
    config,
    settle: () => Promise.all([...pending]),
    close: async () => {
      if (timer) clearInterval(timer)
      closed = true
      await Promise.all([...pending])
      await accounts.settle()
      billing.recoverReservations()
      lease?.release()
      db.close()
    },
  }
}
