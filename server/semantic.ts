import { Worker } from 'node:worker_threads'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
export const semanticModel = 'Xenova/all-MiniLM-L6-v2'
export const semanticRevision = '751bff37182d3f1213fa05d7196b954e230abad9'
const workerSource = String.raw`
const {parentPort,workerData}=require('node:worker_threads');
let extractor;
parentPort.on('message',async ({texts})=>{
 try {
  const {pipeline,env}=await import(workerData.moduleUrl);
  env.cacheDir=workerData.cacheDir;env.allowLocalModels=false;env.useBrowserCache=false;
  if(!extractor)extractor=await pipeline('feature-extraction',workerData.model,{revision:workerData.revision,dtype:'q8',device:'cpu',session_options:{intraOpNumThreads:1,interOpNumThreads:1}});
  const embeddings=[];
  for(const text of texts){const out=await extractor(text,{pooling:'mean',normalize:true});embeddings.push(out.tolist()[0]);}
  parentPort.postMessage({vectors:embeddings});
 }catch{parentPort.postMessage({error:'The local semantic model could not load or complete this request.'});}
});
`
export function cosine(a: number[], b: number[]) {
  return a.reduce((n, x, i) => n + x * (b[i] || 0), 0)
}
export function createSemantic(db: DatabaseSync, cacheDir: string, enabled: boolean) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS semantic_vectors(key TEXT PRIMARY KEY,data TEXT NOT NULL,at INTEGER NOT NULL)',
  )
  let worker: Worker | null = null,
    busy = false,
    idle: ReturnType<typeof setTimeout> | null = null,
    state = 'not_loaded'
  const stop = () => {
    if (idle) clearTimeout(idle)
    idle = null
    const prior = worker
    worker = null
    state = 'not_loaded'
    return prior?.terminate()
  }
  const status = () => ({ enabled, model: semanticModel, revision: semanticRevision, state })
  const encode = async (texts: string[], scope: string) => {
    if (!enabled) throw Error('Local semantic matching is disabled.')
    if (texts.length > 32 || texts.some((t) => typeof t !== 'string' || t.length > 4000))
      throw Error('Semantic input limit exceeded.')
    if (busy) throw Error('Semantic matching is busy. Try again shortly.')
    busy = true
    if (idle) clearTimeout(idle)
    try {
      const keys = texts.map((t) =>
        createHash('sha256')
          .update(semanticRevision + '\n' + scope + '\n' + t)
          .digest('hex'),
      )
      const cached = keys.map((key) => {
        const row = db.prepare('SELECT data FROM semantic_vectors WHERE key=?').get(key) as any
        return row ? (JSON.parse(row.data) as number[]) : null
      })
      const missing: number[] = []
      for (let i = 0; i < cached.length; i++) if (!cached[i]) missing.push(i)
      if (missing.length) {
        if (!worker) {
          state = 'loading'
          worker = new Worker(workerSource, {
            eval: true,
            execArgv: [],
            env: {},
            workerData: {
              moduleUrl: import.meta.resolve('@huggingface/transformers'),
              cacheDir: resolve(cacheDir),
              model: semanticModel,
              revision: semanticRevision,
            },
            resourceLimits: {
              maxOldGenerationSizeMb: 96,
              maxYoungGenerationSizeMb: 16,
              stackSizeMb: 4,
            },
            stdout: true,
            stderr: true,
          })
          worker.stdout?.resume()
          worker.stderr?.resume()
        }
        const current = worker
        const vectors = await new Promise<number[][]>((resolve, reject) => {
          const timeout = setTimeout(() => {
            finish()
            void stop()
            state = 'unavailable'
            reject(Error('Local model timed out; use the evidence-only review.'))
          }, 90000)
          const finish = () => {
            clearTimeout(timeout)
            current.off('message', message)
            current.off('error', error)
            current.off('exit', exit)
          }
          const error = () => {
            finish()
            if (worker === current) worker = null
            state = 'unavailable'
            reject(Error('Local model worker is unavailable.'))
          }
          const exit = () => error()
          const message = (data: any) => {
            finish()
            if (
              data.error ||
              !Array.isArray(data.vectors) ||
              data.vectors.length !== missing.length ||
              data.vectors.some(
                (v: any) =>
                  !Array.isArray(v) ||
                  v.length !== 384 ||
                  v.some((x: any) => typeof x !== 'number' || !Number.isFinite(x)),
              )
            ) {
              state = 'unavailable'
              reject(Error('Local model returned no usable vectors.'))
            } else {
              state = 'ready'
              resolve(data.vectors)
            }
          }
          current.once('message', message)
          current.once('error', error)
          current.once('exit', exit)
          current.postMessage({ texts: missing.map((i) => texts[i]) })
        })
        for (let i = 0; i < missing.length; i++) {
          cached[missing[i]] = vectors[i]
          db.prepare(
            'INSERT INTO semantic_vectors VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,at=excluded.at',
          ).run(keys[missing[i]], JSON.stringify(vectors[i]), Date.now())
        }
        db.prepare(
          'DELETE FROM semantic_vectors WHERE key IN (SELECT key FROM semantic_vectors ORDER BY at DESC LIMIT -1 OFFSET 5000)',
        ).run()
      }
      return cached as number[][]
    } finally {
      busy = false
      idle = setTimeout(() => {
        void stop()
      }, 60000)
      idle.unref()
    }
  }
  return { encode, status, close: stop }
}
