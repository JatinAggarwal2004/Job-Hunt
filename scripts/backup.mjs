import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, chmodSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
const source = resolve(process.env.JOB_HUNTER_DB || 'data/job-hunter.sqlite')
if (!existsSync(source)) throw Error('Database does not exist; no backup created')
mkdirSync('backups', { recursive: true, mode: 0o700 })
const target = resolve(
  'backups',
  `job-hunter-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`,
)
const db = new DatabaseSync(source)
try {
  db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`)
  chmodSync(target, 0o600)
  const backup = new DatabaseSync(target, { readOnly: true })
  try {
    const result = backup.prepare('PRAGMA integrity_check').get()
    if (Object.values(result)[0] !== 'ok') throw Error('Backup integrity check failed')
  } finally {
    backup.close()
  }
  console.log(`Verified private backup created: ${target}`)
} finally {
  db.close()
}
