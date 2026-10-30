import type { Entitlements } from './billing.ts'
export type Page =
  'overview' | 'discover' | 'resume' | 'applications' | 'profile' | 'settings' | 'admin' | 'billing'
export type User = {
  id: string
  name: string
  email: string
  role: 'user' | 'admin'
  emailVerified?: boolean
}
export type Profile = {
  name: string
  email: string
  phone: string
  location: string
  website: string
  linkedin: string
  summary: string
  skills: string[]
  roles: string[]
  locations: string[]
  remoteOnly: boolean
  experienceLevels?: string[]
  experience: string
  salaryMin: number
  currency: string
  includeUnknownSalary: boolean
  companySizes: string[]
  scheduleEnabled: boolean
  scheduleHour: number
  timezone: string
}
export type Job = {
  via?: string
  applyLinks?: { name: string; url: string }[]
  available?: boolean
  id: string
  title: string
  company: string
  location: string
  remote: boolean
  url: string
  description: string
  source: string
  postedAt: string | null
  fetchedAt: string
  salaryMin: number | null
  salaryMax: number | null
  currency: string | null
  companySize: string | null
  matchScore: number
  matchReasons: string[]
  status: ApplicationStatus | null
}
export type ApplicationStatus =
  'saved' | 'preparing' | 'applied' | 'interview' | 'offer' | 'rejected'
export type Application = {
  id: string
  job: Job
  status: ApplicationStatus
  notes: string
  updatedAt: string
}
export type Source = {
  id: string
  name: string
  type: 'arbeitnow' | 'greenhouse' | 'lever' | 'ashby' | 'google_jobs'
  slug: string
  enabled: boolean
  lastRun: string | null
  lastError: string | null
  jobCount: number
}
export type Run = {
  coverage?: SearchCoverage[]
  id: string
  status: 'running' | 'completed' | 'partial' | 'failed'
  startedAt: string
  finishedAt: string | null
  jobsFound: number
  error: string | null
}
export type SearchCoverage = {
  source: string
  name: string
  status: 'completed' | 'limited' | 'failed'
  pages: number
  jobs: number
  queries: string[]
  omittedQueries: number
  note: string
}
export type Suggestion = {
  id: string
  title: string
  detail: string
  before: string
  after: string
  status: 'pending' | 'accepted' | 'rejected'
  category: string
}
export type Analysis = {
  score: number
  label: string
  engine: 'rules' | 'ollama' | 'gemini'
  dimensions: { name: string; score: number; max: number; reason: string }[]
  matchedSkills: string[]
  missingSkills: string[]
  suggestions: Suggestion[]
  notice: string
}
export type Resume = {
  id: string
  filename: string
  text: string
  createdAt: string
  analysis: Analysis | null
}
export type Overview = {
  jobs: number
  saved: number
  applied: number
  interviews: number
  lastRun: Run | null
  nextRun: string | null
}
export type Settings = {
  brandName: string
  accentColor: string
  discoveryEnabled: boolean
  maxJobsPerSource: number
  aiEnabled: boolean
  ollamaModel: string
  aiProvider?: 'ollama' | 'gemini'
  aiModel?: string
  aiDailyLimit?: number
  aiConsentRequired?: boolean
}
export type Bootstrap = {
  activity?: { enabled: boolean; retentionDays: number }
  entitlements: Entitlements
  emailVerificationRequired?: boolean

  user: User
  profile: Profile
  overview: Overview
  settings: Settings
  ai: { available: boolean; model: string; message: string }
}
