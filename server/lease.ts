import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
export function acquireWorkerLease(db: DatabaseSync) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS worker_lease(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,expires INTEGER NOT NULL)',
  )
  const owner = randomUUID(),
    ttl = 90000
  db.exec('BEGIN IMMEDIATE')
  try {
    const old = db.prepare('SELECT * FROM worker_lease WHERE id=1').get() as any
    if (old && old.expires > Date.now())
      throw Error(
        'Another API/worker instance owns this database. Use one replica and wait for an expired lease after a crash.',
      )
    db.prepare('INSERT OR REPLACE INTO worker_lease VALUES(1,?,?)').run(owner, Date.now() + ttl)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  let valid = true
  const timer = setInterval(() => {
    try {
      const result = db
        .prepare('UPDATE worker_lease SET expires=? WHERE id=1 AND owner=?')
        .run(Date.now() + ttl, owner)
      valid = Boolean(result.changes)
    } catch {
      valid = false
    }
  }, 20000)
  timer.unref()
  return {
    valid: () => valid,
    release: () => {
      clearInterval(timer)
      db.prepare('DELETE FROM worker_lease WHERE owner=?').run(owner)
      valid = false
    },
  }
}
