import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import { DatabaseSync } from 'node:sqlite'
import { randomBytes, createHash, scryptSync } from 'node:crypto'
import nodemailer from 'nodemailer'
import { z } from 'zod'
import { httpsMailSender } from './mail.ts'
export type OutgoingMail = { to: string; subject: string; text: string }
export type MailSender = (mail: OutgoingMail) => Promise<void>
class AccountError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
export function accountSecurity(
  db: DatabaseSync,
  options: {
    env?: NodeJS.ProcessEnv
    sendMail?: MailSender
    clock?: () => number
    mailFetcher?: typeof fetch
  } = {},
) {
  const env = options.env || process.env,
    clock = options.clock || Date.now
  const columns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[]
  if (!columns.some((c) => c.name === 'email_verified'))
    db.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0')
  db.exec(
    'CREATE TABLE IF NOT EXISTS account_tokens(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,purpose TEXT NOT NULL,expires INTEGER NOT NULL)',
  )
  const httpsSender = httpsMailSender(env, options.mailFetcher)
  const smtpReady =
    (!env.MAIL_PROVIDER || env.MAIL_PROVIDER === 'smtp') &&
    Boolean(env.SMTP_HOST && env.SMTP_FROM && env.SMTP_USER && env.SMTP_PASSWORD)
  const transporter = smtpReady
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT || 465),
        secure: env.SMTP_SECURE !== 'false',
        requireTLS: true,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        tls: { rejectUnauthorized: true },
      })
    : null
  const sendMail: MailSender =
    options.sendMail ||
    httpsSender ||
    (async (mail) => {
      if (!transporter)
        throw new AccountError(
          503,
          'Email delivery is not configured. Ask the administrator to configure an email provider.',
        )
      await transporter.sendMail({ from: env.SMTP_FROM, ...mail })
    })
  const digest = (value: string) => createHash('sha256').update(value).digest('hex')
  const deliveries = new Set<Promise<void>>()
  const issue = async (user: { id: string; email: string }, purpose: 'verify' | 'reset') => {
    const token = randomBytes(32).toString('hex')
    db.prepare('DELETE FROM account_tokens WHERE user_id=? AND purpose=?').run(user.id, purpose)
    db.prepare('INSERT INTO account_tokens VALUES(?,?,?,?)').run(
      digest(token),
      user.id,
      purpose,
      clock() + (purpose === 'verify' ? 86400000 : 1800000),
    )
    const link = new URL('/app', env.APP_ORIGIN || 'http://127.0.0.1:5173')
    link.searchParams.set(purpose, token)
    try {
      await sendMail({
        to: user.email,
        subject:
          purpose === 'verify' ? 'Verify your Job-Hunter email' : 'Reset your Job-Hunter password',
        text: `${purpose === 'verify' ? 'Verify your email address' : 'Reset your password'} by opening this link:\n\n${link}\n\n${purpose === 'verify' ? 'This link expires in 24 hours.' : 'This link expires in 30 minutes.'} If you did not request this, ignore this email.`,
      })
    } catch {
      db.prepare('DELETE FROM account_tokens WHERE hash=?').run(digest(token))
      throw new AccountError(
        503,
        'Email could not be delivered. Please retry later or contact the administrator.',
      )
    }
  }
  const route =
    (fn: (req: Request, res: Response) => unknown) =>
    (req: Request, res: Response, next: NextFunction) =>
      Promise.resolve()
        .then(() => fn(req, res))
        .catch(next)
  const publicRouter = express.Router(),
    privateRouter = express.Router()
  publicRouter.post(
    '/auth/request-reset',
    route(async (req, res) => {
      const { email } = z.object({ email: z.string().email().max(254) }).parse(req.body)
      const user = db
        .prepare('SELECT id,email FROM users WHERE email=?')
        .get(email.toLowerCase()) as any
      if (user) {
        // Respond independently of SMTP latency to avoid revealing registered addresses.
        const delivery = issue(user, 'reset').catch(() => {})
        deliveries.add(delivery)
        void delivery.finally(() => deliveries.delete(delivery))
      }
      res.status(202).json({
        message:
          'If this account exists and email delivery is available, a reset link has been sent. Check your inbox and spam folder.',
      })
    }),
  )
  publicRouter.post(
    '/auth/reset',
    route((req, res) => {
      const { token, password } = z
        .object({
          token: z.string().regex(/^[a-f0-9]{64}$/),
          password: z.string().min(10).max(128),
        })
        .parse(req.body)
      const row = db
        .prepare('SELECT * FROM account_tokens WHERE hash=? AND purpose=? AND expires>?')
        .get(digest(token), 'reset', clock()) as any
      if (!row)
        throw new AccountError(400, 'This reset link is invalid or expired. Request a new one.')
      const salt = randomBytes(16).toString('hex'),
        hashed = salt + ':' + scryptSync(password, salt, 64).toString('hex')
      db.exec('BEGIN IMMEDIATE')
      try {
        db.prepare('UPDATE users SET password=? WHERE id=?').run(hashed, row.user_id)
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.user_id)
        db.prepare('DELETE FROM extension_tokens WHERE user_id=?').run(row.user_id)
        db.prepare('DELETE FROM account_tokens WHERE user_id=?').run(row.user_id)
        db.exec('COMMIT')
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
      res.locals.activityUserId = row.user_id
      res.json({ message: 'Password changed. Sign in with your new password.' })
    }),
  )
  publicRouter.post(
    '/auth/verify',
    route((req, res) => {
      const { token } = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(req.body)
      const row = db
        .prepare('SELECT * FROM account_tokens WHERE hash=? AND purpose=? AND expires>?')
        .get(digest(token), 'verify', clock()) as any
      if (!row)
        throw new AccountError(
          400,
          'This verification link is invalid or expired. Request another email.',
        )
      db.exec('BEGIN IMMEDIATE')
      try {
        db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(row.user_id)
        db.prepare('DELETE FROM account_tokens WHERE user_id=? AND purpose=?').run(
          row.user_id,
          'verify',
        )
        db.exec('COMMIT')
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
      res.locals.activityUserId = row.user_id
      res.json({ message: 'Email verified. You can continue to your workspace.' })
    }),
  )
  privateRouter.post(
    '/auth/send-verification',
    route(async (req, res) => {
      const user = (req as any).user
      const row = db.prepare('SELECT email_verified FROM users WHERE id=?').get(user.id) as any
      if (row.email_verified) return res.json({ message: 'Your email is already verified.' })
      await issue(user, 'verify')
      res.json({ message: 'Verification email sent. Check your inbox and spam folder.' })
    }),
  )
  privateRouter.get(
    '/account/export',
    route((req, res) => {
      const user = (req as any).user
      const profile = db.prepare('SELECT data FROM profiles WHERE user_id=?').get(user.id) as any
      const applications = db.prepare('SELECT * FROM applications WHERE user_id=?').all(user.id)
      const resumes = db.prepare('SELECT data FROM resumes WHERE user_id=?').all(user.id) as any[]
      res.setHeader('Content-Disposition', 'attachment; filename="job-hunter-account.json"')
      res.json({
        user,
        activity: db
          .prepare(
            'SELECT at,source,action,page,resource_id,request_id,status FROM activity_events WHERE user_id=? ORDER BY at DESC LIMIT 10000',
          )
          .all(user.id),
        activityExportLimit: 10000,
        profile: JSON.parse(profile.data),
        applications,
        resumes: resumes.map((r) => JSON.parse(r.data)),
      })
    }),
  )
  return {
    publicRouter,
    privateRouter,
    issue,
    mailReady: smtpReady || Boolean(httpsSender || options.sendMail),
    settle: () => Promise.all([...deliveries]),
  }
}
