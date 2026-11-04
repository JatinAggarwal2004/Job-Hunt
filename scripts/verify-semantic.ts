import { DatabaseSync } from 'node:sqlite'
import { createSemantic, cosine } from '../server/semantic.ts'
const db = new DatabaseSync(':memory:')
const model = createSemantic(db, process.env.MODEL_CACHE_DIR || '/tmp/job-hunt-model-cache', true)
try {
  const start = Date.now()
  const vectors = await model.encode(
    [
      'Build reliable backend services using Java and Spring Boot, SQL databases and REST APIs.',
      'Developed Java microservices with Spring Boot and PostgreSQL REST APIs for a payments project.',
      'Prepared social media marketing campaigns, designed graphics in Photoshop and wrote advertising copy.',
    ],
    'synthetic-proof',
  )
  const related = cosine(vectors[0], vectors[1]),
    unrelated = cosine(vectors[0], vectors[2])
  console.log(
    JSON.stringify({
      model: model.status(),
      dimensions: vectors[0].length,
      related,
      unrelated,
      passed: related > unrelated,
      elapsedMs: Date.now() - start,
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    }),
  )
  if (!(related > unrelated)) process.exitCode = 1
} finally {
  await model.close()
  db.close()
}
