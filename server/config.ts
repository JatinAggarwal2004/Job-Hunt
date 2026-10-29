import { z } from 'zod'
export function runtimeConfig(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === 'production'
  if (env.RAILWAY_ENVIRONMENT_ID && !production)
    throw Error('Railway deployments must set NODE_ENV=production before the API can start.')
  const origin = new URL(
    env.APP_ORIGIN ||
      (production && env.RENDER === 'true' ? env.RENDER_EXTERNAL_URL || '' : '') ||
      'http://127.0.0.1:5173',
  )
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash)
    throw Error('APP_ORIGIN must contain only an origin')
  if (production && origin.protocol !== 'https:')
    throw Error('Production APP_ORIGIN must use HTTPS')
  if (!['http:', 'https:'].includes(origin.protocol)) throw Error('Invalid APP_ORIGIN protocol')
  const bootstrapEmail = (env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase()
  if (production && !z.string().email().safeParse(bootstrapEmail).success)
    throw Error('BOOTSTRAP_ADMIN_EMAIL is required in production')
  if (production && env.RENDER === 'true')
    throw Error(
      'This SQLite release cannot run on Render Free without losing data. Configure the durable cloud database release before deploying; local accounts and payment records must never use ephemeral storage.',
    )
  const port = Number(env.PORT || 3001)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid PORT')
  const origins = new Set([origin.origin])
  if (!production)
    for (const host of ['127.0.0.1', 'localhost'])
      for (const p of [5173, 4173, 3001, port]) origins.add(`http://${host}:${p}`)
  return {
    production,
    origin: origin.origin,
    hostname: origin.hostname,
    port,
    host: env.HOST || (production ? '0.0.0.0' : '127.0.0.1'),
    bootstrapEmail,
    requireVerification: production || env.REQUIRE_EMAIL_VERIFICATION === 'true',
    origins,
    trustProxy: env.TRUST_PROXY === '1' ? 1 : (false as false | number),
  }
}
export type RuntimeConfig = ReturnType<typeof runtimeConfig>
