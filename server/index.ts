import { createApp } from './app.ts'
import { pathToFileURL } from 'node:url'
export function start() {
  const backend = createApp()
  const port = backend.config.port
  const server = backend.app.listen(port, backend.config.host, () =>
    console.log(`Job-Hunter API: http://127.0.0.1:${port}`),
  )
  const stop = () => server.close(() => void backend.close().then(() => process.exit(0)))
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  return { ...backend, server }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start()
