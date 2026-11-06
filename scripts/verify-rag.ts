import { DatabaseSync } from 'node:sqlite'
import { dirname, resolve } from 'node:path'
import { createRetrieval } from '../server/retrieval.ts'
import { createSemantic } from '../server/semantic.ts'
import { semanticContext } from '../server/semantic-review.ts'
import { createGroundedGeneration } from '../server/grounded-ai.ts'
import { match } from '../server/sources.ts'
import type { Profile, Settings, Source, Job } from '../shared/types.ts'
// An operator diagnostic, never an HTTP route. It uses only public-job context.
if (process.getuid?.() === 0) {
  process.setgroups?.([])
  process.setgid?.(1000)
  process.setuid?.(1000)
}
const env = process.env
if (
  env.ENABLE_HOSTED_AI !== 'true' ||
  env.AI_GEMINI_PUBLIC_JOBS_ONLY !== 'true' ||
  !env.AI_GEMINI_API_KEY ||
  !env.JOB_HUNTER_DB ||
  !env.BOOTSTRAP_ADMIN_EMAIL
)
  throw Error('Approved public-job configuration is required.')
const db = new DatabaseSync(env.JOB_HUNTER_DB)
const semantic = createSemantic(
  db,
  resolve(dirname(env.JOB_HUNTER_DB), 'models'),
  env.ENABLE_SEMANTIC_MODEL !== 'false',
)
try {
  const owner = db
    .prepare('SELECT id,role,email_verified FROM users WHERE email=?')
    .get(env.BOOTSTRAP_ADMIN_EMAIL) as
    { id: string; role: string; email_verified: number } | undefined
  if (!owner || owner.role !== 'admin' || !owner.email_verified)
    throw Error('Verified bootstrap administrator required.')
  const settings: Settings = JSON.parse(
    (db.prepare('SELECT data FROM settings WHERE id=1').get() as { data: string }).data,
  )
  if (
    !settings.aiEnabled ||
    settings.aiProvider !== 'gemini' ||
    settings.aiModel !== env.AI_GEMINI_MODEL
  )
    throw Error('Approved Gemini model must be enabled.')
  const profile: Profile = JSON.parse(
    (db.prepare('SELECT data FROM profiles WHERE user_id=?').get(owner.id) as { data: string })
      .data,
  )
  const sources = (db.prepare('SELECT data FROM sources').all() as { data: string }[]).map(
    (r) => JSON.parse(r.data) as Source,
  )
  const question = process.argv.includes('--unknowns')
    ? 'Do these Java backend job excerpts state an application deadline or a salary? Report unknown when the excerpts do not establish it.'
    : 'Which Java backend technologies do these openings require? Summarise the evidence and cite each job.'
  const retrieval = createRetrieval(db)
  let context = retrieval.retrieve(
    owner.id,
    question,
    (j: Job) => sources.some((s) => s.id === j.source && s.enabled) && match(j, profile).eligible,
    undefined,
    31,
  )
  context = await semanticContext(owner.id, question, context, semantic.encode)
  await semantic.close()
  if (!context.evidence.length)
    throw Error('No eligible supporting evidence; no generation call made.')
  const result = await createGroundedGeneration(db, env)(
    owner.id,
    question,
    context,
    settings,
    true,
  )
  if (result.engine !== 'gemini' || !result.evidence.length)
    throw Error('No generated cited answer returned.')
  console.log(
    JSON.stringify({
      engine: result.engine,
      model: settings.aiModel,
      citations: result.evidence.map((e) => e.id),
      answer: result.answer,
      resumeIncluded: false,
    }),
  )
} finally {
  await semantic.close()
  db.close()
}
