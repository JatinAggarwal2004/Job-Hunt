import { chmodSync, chownSync, realpathSync } from 'node:fs'

// Railway mounts volumes as root. Drop privileges before importing the server.
if (
  !process.env.RAILWAY_ENVIRONMENT_ID ||
  process.env.RAILWAY_VOLUME_MOUNT_PATH !== '/app/data' ||
  realpathSync('/app/data') !== '/app/data'
) {
  throw Error('Attach the Railway persistent volume at /app/data before starting this service.')
}
if (process.getuid?.() === 0) {
  chownSync('/app/data', 1000, 1000)
  chmodSync('/app/data', 0o700)
  process.setgroups([])
  process.setgid(1000)
  process.setuid(1000)
}
if (process.getuid?.() !== 1000) throw Error('Railway runtime must use the unprivileged node user.')
console.log('Runtime user: 1000; persistent volume mounted at /app/data')
const { start } = await import('../build/server/index.mjs')
start()
