import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { MailSender } from './accounts.ts'
import type { Job } from '../shared/types.ts'
import type { DeadlineAlert } from '../shared/matching.ts'
export function createAlerts(db: DatabaseSync, sendMail: MailSender | null, origin: string) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS job_alerts(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),job_id TEXT NOT NULL REFERENCES jobs(id),deadline_at TEXT NOT NULL,remind_at TEXT NOT NULL,email_enabled INTEGER NOT NULL DEFAULT 0,sent_at TEXT,read_at TEXT,error TEXT,attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,claimed_at INTEGER,provenance TEXT NOT NULL,UNIQUE(user_id,job_id)); CREATE TABLE IF NOT EXISTS alert_mail_usage(day TEXT PRIMARY KEY,attempts INTEGER NOT NULL)`,
  )
  const list = (uid: string, time = Date.now()): DeadlineAlert[] =>
    (
      db
        .prepare(
          'SELECT a.*,j.data FROM job_alerts a JOIN jobs j ON j.id=a.job_id WHERE a.user_id=? ORDER BY a.remind_at DESC',
        )
        .all(uid) as any[]
    ).map((r) => {
      const j = JSON.parse(r.data)
      return {
        id: r.id,
        jobId: r.job_id,
        title: j.title,
        company: j.company,
        url: j.url,
        deadlineAt: r.deadline_at,
        remindAt: r.remind_at,
        emailEnabled: !!r.email_enabled,
        sentAt: r.sent_at,
        readAt: r.read_at,
        due: Date.parse(r.remind_at) <= time,
        error: r.error,
        provenance: r.provenance,
      }
    })
  const save = (
    uid: string,
    job: Job,
    deadlineAt: string,
    remindAt: string,
    emailEnabled: boolean,
  ) => {
    const deadline = Date.parse(deadlineAt),
      reminder = Date.parse(remindAt)
    if (
      !Number.isFinite(deadline) ||
      !Number.isFinite(reminder) ||
      deadline <= Date.now() ||
      reminder > deadline
    )
      throw Object.assign(Error('Choose a future deadline and a reminder at or before it.'), {
        status: 400,
      })
    if (emailEnabled && !sendMail)
      throw Object.assign(
        Error('Email reminders are not configured. Save an in-app reminder instead.'),
        { status: 503 },
      )
    const canonicalDeadline = new Date(deadline).toISOString(),
      canonicalReminder = new Date(reminder).toISOString()
    const prior = db
      .prepare('SELECT * FROM job_alerts WHERE user_id=? AND job_id=?')
      .get(uid, job.id) as any
    const unchanged =
      prior &&
      prior.deadline_at === canonicalDeadline &&
      prior.remind_at === canonicalReminder &&
      !!prior.email_enabled === emailEnabled
    if (unchanged) return list(uid).find((a) => a.id === prior.id)!
    const provenance =
      job.deadlineAt && Date.parse(job.deadlineAt) === deadline ? 'employer' : 'user'
    db.prepare(
      `INSERT INTO job_alerts(id,user_id,job_id,deadline_at,remind_at,email_enabled,provenance) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,job_id) DO UPDATE SET deadline_at=excluded.deadline_at,remind_at=excluded.remind_at,email_enabled=excluded.email_enabled,provenance=excluded.provenance,sent_at=NULL,read_at=NULL,error=NULL,attempts=0,next_attempt=0,claimed_at=NULL`,
    ).run(
      prior?.id || randomUUID(),
      uid,
      job.id,
      canonicalDeadline,
      canonicalReminder,
      Number(emailEnabled),
      provenance,
    )
    return list(uid).find((a) => a.jobId === job.id)!
  }
  const ensure = (uid: string, job: Job) => {
    if (
      !job.deadlineAt ||
      job.deadlineAt.length === 10 ||
      Date.parse(job.deadlineAt) <= Date.now() ||
      db.prepare('SELECT 1 FROM job_alerts WHERE user_id=? AND job_id=?').get(uid, job.id)
    )
      return
    save(
      uid,
      job,
      job.deadlineAt,
      new Date(Math.max(Date.now(), Date.parse(job.deadlineAt) - 86400000)).toISOString(),
      false,
    )
  }
  let inFlight: Promise<void> | null = null
  const tick = (time = new Date()) => {
    if (inFlight || !sendMail) return inFlight || Promise.resolve()
    const current = time.getTime()
    const rows = db
      .prepare(
        `SELECT a.*,u.email,u.email_verified,j.data FROM job_alerts a JOIN users u ON u.id=a.user_id JOIN jobs j ON j.id=a.job_id WHERE a.email_enabled=1 AND a.sent_at IS NULL AND a.attempts<3 AND a.next_attempt<=? AND a.remind_at<=? AND a.deadline_at>? AND (a.claimed_at IS NULL OR a.claimed_at<?) ORDER BY a.remind_at LIMIT 5`,
      )
      .all(current, time.toISOString(), time.toISOString(), current - 300000) as any[]
    inFlight = (async () => {
      for (const row of rows) {
        if (!row.email_verified) continue
        const day = time.toISOString().slice(0, 10)
        db.prepare('INSERT OR IGNORE INTO alert_mail_usage VALUES(?,0)').run(day)
        if (
          !db
            .prepare('UPDATE alert_mail_usage SET attempts=attempts+1 WHERE day=? AND attempts<100')
            .run(day).changes
        )
          break
        const claim = db
          .prepare(
            'UPDATE job_alerts SET claimed_at=?,attempts=attempts+1 WHERE id=? AND sent_at IS NULL AND (claimed_at IS NULL OR claimed_at<?)',
          )
          .run(current, row.id, current - 300000)
        if (!claim.changes) continue
        const accessTable = db
          .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='billing_access'")
          .get()
        if (
          accessTable &&
          (db.prepare('SELECT blocked FROM billing_access WHERE user_id=?').get(row.user_id) as any)
            ?.blocked
        ) {
          db.prepare('UPDATE job_alerts SET email_enabled=0,claimed_at=NULL WHERE id=?').run(row.id)
          continue
        }
        const job = JSON.parse(row.data)
        try {
          await sendMail({
            to: row.email,
            subject: `Job deadline reminder: ${job.title}`.slice(0, 150),
            text: `Your reminder for ${job.title} at ${job.company}.\nRecorded deadline: ${row.deadline_at}. ${row.provenance === 'user' ? 'You entered this deadline.' : 'The employer listing supplied this expiry.'}\nConfirm availability and timing on the employer page: ${job.url}\nReview your job workspace: ${origin}/app\nYou enabled this reminder; manage or cancel it in Alerts.`,
          })
          db.prepare(
            'UPDATE job_alerts SET sent_at=?,claimed_at=NULL,error=NULL WHERE id=? AND claimed_at=?',
          ).run(new Date().toISOString(), row.id, current)
        } catch {
          db.prepare(
            'UPDATE job_alerts SET claimed_at=NULL,error=?,next_attempt=? WHERE id=? AND claimed_at=?',
          ).run(
            'Email delivery failed. Retry is limited; your in-app reminder remains available.',
            current + 300000,
            row.id,
            current,
          )
        }
      }
    })().finally(() => {
      inFlight = null
    })
    return inFlight
  }
  return {
    list,
    save,
    ensure,
    tick,
    emailReady: !!sendMail,
    settle: () => inFlight || Promise.resolve(),
    read: (uid: string, id: string) =>
      db
        .prepare('UPDATE job_alerts SET read_at=? WHERE id=? AND user_id=?')
        .run(new Date().toISOString(), id, uid),
    remove: (uid: string, id: string) =>
      db.prepare('DELETE FROM job_alerts WHERE id=? AND user_id=?').run(id, uid),
  }
}
