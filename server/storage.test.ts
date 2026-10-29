import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { durableDatabasePath } from './storage.ts'
import { createApp } from './app.ts'

const cloud = { NODE_ENV: 'production', RAILWAY_ENVIRONMENT_ID: 'test-environment' }
test('Railway refuses missing volumes, in-memory storage and paths outside the volume', () => {
  const dir = mkdtempSync(join(tmpdir(), 'job-storage-'))
  const env = { ...cloud, RAILWAY_VOLUME_MOUNT_PATH: dir }
  try {
    for (const [path, config] of [
      [join(dir, 'jobs.sqlite'), cloud],
      [join(dir, 'jobs.sqlite'), { ...env, RAILWAY_VOLUME_MOUNT_PATH: join(dir, 'absent') }],
      [':memory:', env],
      [join(dir, '..', 'outside.sqlite'), env],
      [join(`${dir}-other`, 'jobs.sqlite'), env],
      [join(dir, 'jobs.sqlite'), { ...env, RAILWAY_VOLUME_MOUNT_PATH: '/' }],
    ] as const)
      assert.throws(() => durableDatabasePath(path, config), /attached persistent volume/)
    assert.equal(durableDatabasePath(':memory:', {}), ':memory:')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Railway rejects directory and database symlinks that escape durable storage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'job-storage-'))
  mkdirSync(join(dir, 'volume'))
  mkdirSync(join(dir, 'outside'))
  const env = { ...cloud, RAILWAY_VOLUME_MOUNT_PATH: join(dir, 'volume') }
  try {
    symlinkSync(join(dir, 'outside'), join(dir, 'volume', 'escape'))
    writeFileSync(join(dir, 'outside', 'existing.sqlite'), '')
    symlinkSync(join(dir, 'outside', 'existing.sqlite'), join(dir, 'volume', 'existing.sqlite'))
    for (const path of [
      join(dir, 'volume', 'escape', 'nested', 'jobs.sqlite'),
      join(dir, 'volume', 'existing.sqlite'),
    ])
      assert.throws(() => durableDatabasePath(path, env), /Ephemeral SQLite is disabled/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a database inside the configured volume retains records when the API restarts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'job-storage-'))
  const path = join(dir, 'nested', 'jobs.sqlite')
  const env = {
    ...cloud,
    RAILWAY_VOLUME_MOUNT_PATH: dir,
    APP_ORIGIN: 'https://jobs.example.test',
    BOOTSTRAP_ADMIN_EMAIL: 'owner@example.test',
  }
  try {
    assert.equal(durableDatabasePath(path, env), resolve(path))
    const first = createApp({ dbPath: path, env, worker: false })
    first.db
      .prepare('INSERT INTO system_meta(key,value) VALUES(?,?)')
      .run('retention_probe', 'retained')
    await first.close()
    const second = createApp({ dbPath: path, env, worker: false })
    try {
      assert.equal(
        second.db.prepare('SELECT value FROM system_meta WHERE key=?').get('retention_probe')
          ?.value,
        'retained',
      )
    } finally {
      await second.close()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
