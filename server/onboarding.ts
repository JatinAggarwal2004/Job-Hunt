import { Router } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import type { Profile } from '../shared/types.ts'
import type { SetupState } from '../shared/onboarding.ts'

const choices = z.array(z.string().trim().min(1).max(100)).max(50)
const draftSchema = z
  .object({
    step: z.number().int().min(0).max(2),
    roles: choices,
    locations: choices,
    experienceLevels: z
      .array(z.enum(['Internship', 'Entry level', 'Mid level', 'Senior', 'Lead']))
      .max(5),
    remoteOnly: z.boolean(),
    resumeId: z.string().min(1).max(100).nullable(),
  })
  .strict()

export function createOnboarding(db: DatabaseSync, profile: (id: string) => Profile) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS onboarding(user_id TEXT PRIMARY KEY REFERENCES users(id),data TEXT NOT NULL)',
  )
  const save = (id: string, state: SetupState) => {
    db.prepare(
      'INSERT INTO onboarding(user_id,data) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data',
    ).run(id, JSON.stringify(state))
    return state
  }
  const get = (id: string): SetupState => {
    const row = db.prepare('SELECT data FROM onboarding WHERE user_id=?').get(id) as
      { data: string } | undefined
    if (row) {
      const state: SetupState = JSON.parse(row.data)
      if (!state.completed) return state
      const p = profile(id)
      return {
        ...state,
        step: 0,
        roles: p.roles,
        locations: p.locations,
        experienceLevels: p.experienceLevels || [],
        remoteOnly: p.remoteOnly,
      }
    }
    const p = profile(id)
    const established =
      Boolean(p.roles.length && p.locations.length) ||
      Boolean(db.prepare('SELECT 1 FROM runs WHERE user_id=? LIMIT 1').get(id))
    return {
      step: 0,
      roles: p.roles,
      locations: p.locations,
      experienceLevels: p.experienceLevels?.length
        ? p.experienceLevels
        : p.experience
          ? [p.experience].filter((v) =>
              ['Internship', 'Entry level', 'Mid level', 'Senior', 'Lead'].includes(v),
            )
          : [],
      remoteOnly: p.remoteOnly,
      resumeId: null,
      completed: established,
      dismissed: false,
    }
  }
  const router = Router()
  router.get('/onboarding', (req, res) => res.json(get((req as any).user.id)))
  router.put('/onboarding', (req, res, next) => {
    try {
      const id = (req as any).user.id as string
      const draft = draftSchema.parse(req.body)
      if (
        draft.resumeId &&
        !db.prepare('SELECT 1 FROM resumes WHERE id=? AND user_id=?').get(draft.resumeId, id)
      )
        return res
          .status(404)
          .json({ error: 'Resume not found. Remove it or choose another file.' })
      res.json(save(id, { ...get(id), ...draft, completed: false }))
    } catch (e) {
      next(e)
    }
  })
  router.post('/onboarding/dismiss', (req, res) => {
    const id = (req as any).user.id as string
    res.json(save(id, { ...get(id), dismissed: true }))
  })
  router.post('/onboarding/complete', (req, res, next) => {
    try {
      const id = (req as any).user.id as string
      const state = get(id)
      if (!state.roles.length || !state.locations.length)
        return res
          .status(400)
          .json({ error: 'Choose at least one role and location before finding matches.' })
      // Resume is optional. A deleted file must never prevent finishing setup.
      if (
        state.resumeId &&
        !db.prepare('SELECT 1 FROM resumes WHERE id=? AND user_id=?').get(state.resumeId, id)
      )
        state.resumeId = null
      const p = {
        ...profile(id),
        roles: state.roles,
        locations: state.locations,
        experienceLevels: state.experienceLevels,
        experience: state.experienceLevels[0] || '',
        remoteOnly: state.remoteOnly,
      }
      db.exec('BEGIN')
      try {
        db.prepare('UPDATE profiles SET data=? WHERE user_id=?').run(JSON.stringify(p), id)
        save(id, { ...state, completed: true, dismissed: false })
        db.exec('COMMIT')
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
      res.json({ profile: p, state: get(id) })
    } catch (e) {
      next(e)
    }
  })
  return { router, get }
}
