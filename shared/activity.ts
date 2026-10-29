import type { Entitlements } from './billing.ts'
import type { Run } from './types.ts'
export const activityPages = [
  'overview',
  'discover',
  'resume',
  'applications',
  'profile',
  'settings',
  'billing',
  'admin',
] as const
export type ActivityPage = (typeof activityPages)[number]
export type ActivitySettings = { enabled: boolean; retentionDays: number }
export type ActivityEvent = {
  id: string
  userId: string
  actorId: string
  at: string
  source: 'browser' | 'server'
  action: string
  page: string | null
  resourceId: string | null
  requestId: string | null
  status: number | null
}
export type ActivityAccount = {
  id: string
  name: string
  email: string
  role: string
  active: boolean
  lastSeen: string | null
  page: string | null
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  runningRuns: number
  jobsFound: number
  aiAttempts: number
  entitlements: Entitlements
}
export type ActivityOverview = {
  settings: ActivitySettings
  heartbeatGraceSeconds: number
  activeWindowSeconds: number
  totalUsers: number
  activeUsers: number
  totalRuns: number
  users: ActivityAccount[]
  offset: number
  limit: number
  matchedUsers: number
}
export type ActivityDetail = {
  user: ActivityAccount
  events: ActivityEvent[]
  runs: (Run & { trigger: string; requestId: string | null })[]
  eventTotal: number
  runTotal: number
  offset: number
  limit: number
  retentionDays: number
}
