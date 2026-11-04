import type { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import type { Job } from '../shared/types.ts'
import type { GroundedResponse, RetrievedEvidence } from '../shared/matching.ts'
import { passages, words } from './job-review.ts'
export function createRetrieval(db: DatabaseSync) {
  db.exec(
    'CREATE VIRTUAL TABLE IF NOT EXISTS job_chunks USING fts5(job_id UNINDEXED,ordinal UNINDEXED,title,body); CREATE TABLE IF NOT EXISTS job_chunk_meta(job_id TEXT PRIMARY KEY,hash TEXT NOT NULL)',
  )
  const index = (job: Pick<Job, 'id' | 'title' | 'description'>) => {
    const hash = createHash('sha256')
      .update(job.title + '\n' + job.description)
      .digest('hex')
    if (
      (db.prepare('SELECT hash FROM job_chunk_meta WHERE job_id=?').get(job.id) as any)?.hash ===
      hash
    )
      return
    db.prepare('DELETE FROM job_chunks WHERE job_id=?').run(job.id)
    const insert = db.prepare('INSERT INTO job_chunks(job_id,ordinal,title,body) VALUES(?,?,?,?)')
    for (const [i, text] of passages(job.description).entries())
      insert.run(job.id, i, job.title, text)
    db.prepare(
      'INSERT INTO job_chunk_meta VALUES(?,?) ON CONFLICT(job_id) DO UPDATE SET hash=excluded.hash',
    ).run(job.id, hash)
  }
  // Index public job text, never resumes/contact details. Ownership is enforced at retrieval time.
  for (const row of db.prepare('SELECT data FROM jobs').all() as any[]) index(JSON.parse(row.data))
  const retrieve = (
    userId: string,
    question: string,
    eligible: (job: Job) => boolean,
    jobId?: string,
    count = 6,
  ): GroundedResponse => {
    const terms = words(question).slice(0, 16)
    if (!terms.length)
      return {
        answer: 'Ask about a role, skill, company or job requirement.',
        engine: 'retrieval',
        evidence: [],
        notice: 'Local lexical retrieval; no model call.',
      }
    const query = terms.map((t) => '"' + t.replace(/"/g, '""') + '"').join(' OR ')
    let rows = db
      .prepare(
        `SELECT job_chunks.job_id,job_chunks.ordinal,job_chunks.title,job_chunks.body,jobs.data FROM job_chunks JOIN jobs ON jobs.id=job_chunks.job_id WHERE job_chunks MATCH ? AND job_chunks.job_id IN (SELECT job_id FROM discovered_jobs WHERE user_id=? UNION SELECT job_id FROM applications WHERE user_id=?) ${jobId ? 'AND job_chunks.job_id=?' : ''} ORDER BY bm25(job_chunks,0,0,3,1) LIMIT 200`,
      )
      .all(query, userId, userId, ...(jobId ? [jobId] : [])) as any[]
    const candidateOnly = !rows.length && count > 6
    if (candidateOnly)
      rows = db
        .prepare(
          `SELECT job_chunks.job_id,job_chunks.ordinal,job_chunks.title,job_chunks.body,jobs.data FROM job_chunks JOIN jobs ON jobs.id=job_chunks.job_id WHERE job_chunks.job_id IN (SELECT job_id FROM discovered_jobs WHERE user_id=? UNION SELECT job_id FROM applications WHERE user_id=?) ${jobId ? 'AND job_chunks.job_id=?' : ''} ORDER BY job_chunks.rowid DESC LIMIT 200`,
        )
        .all(userId, userId, ...(jobId ? [jobId] : [])) as any[]
    const evidence: RetrievedEvidence[] = []
    const counts = new Map<string, number>()
    for (const row of rows) {
      const job = JSON.parse(row.data)
      if (!eligible(job) || job.available === false) continue
      if ((counts.get(job.id) || 0) >= 2) continue
      counts.set(job.id, (counts.get(job.id) || 0) + 1)
      evidence.push({
        id: `S${evidence.length + 1}`,
        jobId: job.id,
        title: `${job.company} · ${row.title}`,
        url: job.url,
        quote: row.body,
      })
      if (evidence.length >= Math.min(31, count)) break
    }
    return {
      candidateOnly,
      answer: candidateOnly
        ? 'No lexical evidence was found. Candidate passages require semantic relevance filtering.'
        : evidence.length
          ? `I found ${new Set(evidence.map((e) => e.jobId)).size} relevant openings in your discovered jobs. The excerpts below are the source evidence; review location and experience requirements before applying.`
          : 'No supporting evidence was found in your currently eligible discovered jobs. Refine your question or run discovery using your chosen roles and locations.',
      engine: 'retrieval',
      evidence,
      notice:
        'BM25 lexical retrieval over your eligible job descriptions. Excerpts are source text, not verified claims. A generative model is not connected to this answer.',
    }
  }
  return { index, retrieve }
}
