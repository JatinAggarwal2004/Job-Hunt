export type AccessLevel =
  'blocked' | 'admin' | 'global_free' | 'complimentary' | 'subscriber' | 'free'
export type Entitlements = {
  renewalCancelled?: boolean
  access: AccessLevel
  mode: 'free' | 'paid'
  blocked: boolean
  blockReason: string | null
  freeRunsUsed: number
  freeRunsReserved: number
  freeRunsLimit: number
  freeRunsRemaining: number
  canDiscover: boolean
  canUseAi: boolean
  canSchedule: boolean
  canUseExtension: boolean
  paidThrough: string | null
  subscriptionStatus: string | null
  monthlyPriceInr: number
  checkoutReady: boolean
  paymentMode: 'test' | 'live' | 'unconfigured'
  message: string
}
export type MonetizationSettings = {
  mode: 'free' | 'paid'
  monthlyPriceInr: number
  freeRunLimit: number
}
export type AccessUser = {
  id: string
  name: string
  email: string
  role: 'admin' | 'user'
  entitlements: Entitlements
}
export type AuditEvent = {
  id: string
  actorId: string
  action: string
  targetId: string | null
  detail: string
  createdAt: string
}
export type MonetizationAdmin = {
  settings: MonetizationSettings
  users: AccessUser[]
  complimentaryIds: string[]
  audit: AuditEvent[]
  activeSubscriptions: number
  checkoutReady: boolean
  paymentMode: 'test' | 'live' | 'unconfigured'
  message: string
}
