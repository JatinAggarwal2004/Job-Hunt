export type SetupDraft = {
  step: number
  roles: string[]
  locations: string[]
  experienceLevels: string[]
  remoteOnly: boolean
  resumeId: string | null
}
export type SetupState = SetupDraft & { completed: boolean; dismissed: boolean }
