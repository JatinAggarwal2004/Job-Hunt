import { existsSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

const within = (root: string, path: string) => {
  const suffix = relative(root, path)
  return suffix !== '' && !isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith(`..${sep}`)
}

/** Railway injects the mount path only for services with an attached volume. */
export function durableDatabasePath(path: string, env: NodeJS.ProcessEnv) {
  if (env.NODE_ENV !== 'production' || !env.RAILWAY_ENVIRONMENT_ID) return path
  const mount = env.RAILWAY_VOLUME_MOUNT_PATH
  const error = () =>
    Error(
      'Railway requires an attached persistent volume and JOB_HUNTER_DB inside its mount path. Ephemeral SQLite is disabled.',
    )
  if (!mount || !isAbsolute(mount) || !existsSync(mount) || !statSync(mount).isDirectory())
    throw error()
  const root = realpathSync(mount)
  const file = resolve(path)
  if (root === resolve(sep) || path === ':memory:' || !within(resolve(mount), file)) throw error()
  let ancestor = dirname(file)
  while (!existsSync(ancestor)) ancestor = dirname(ancestor)
  const actualParent = resolve(realpathSync(ancestor), relative(ancestor, dirname(file)))
  if (
    !within(root, resolve(actualParent, 'database')) ||
    (existsSync(file) && !within(root, realpathSync(file)))
  )
    throw error()
  return file
}
