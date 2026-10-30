import { suggestedSkills } from '../shared/profile-options.ts'
export type GuidanceInput = {
  roles: string[]
  skills: string[]
  locations: string[]
  experienceLevels?: string[]
}
export function profileGuidance(
  input: GuidanceInput,
  source: { enabled: number; webConfigured: boolean },
) {
  const selected = new Set(input.skills.map((skill) => skill.toLowerCase()))
  const steps: string[] = []
  if (!input.roles.length) steps.push('Choose at least one role to direct your search.')
  if (!input.locations.length)
    steps.push('Choose a country or city so the search has a clear location.')
  if (!source.enabled) steps.push('Ask your administrator to enable a job source.')
  if (!source.webConfigured)
    steps.push(
      'The web index is not connected; discovery checks enabled feeds and company boards only.',
    )
  const india = input.locations.some((value) =>
    /^(india|bengaluru|bangalore|hyderabad|pune|chennai|mumbai|delhi ncr|gurugram|gurgaon|noida|kolkata)$/i.test(
      value.trim(),
    ),
  )
  return {
    method: 'curated_rules' as const,
    suggestedSkills: suggestedSkills(input.roles).filter(
      (skill) => !selected.has(skill.toLowerCase()),
    ),
    ready: input.roles.length > 0 && input.locations.length > 0 && source.enabled > 0,
    steps,
    summary: `${input.roles.length} ${input.roles.length === 1 ? 'role' : 'roles'} · ${input.locations.length} ${input.locations.length === 1 ? 'location' : 'locations'} · ${input.experienceLevels?.length ? `${input.experienceLevels.length} experience ${input.experienceLevels.length === 1 ? 'level' : 'levels'}` : 'any experience level'}`,
    source: { enabled: source.enabled, webConfigured: source.webConfigured },
    indiaDefaults: india ? { currency: 'INR', timezone: 'Asia/Kolkata' } : null,
    notice:
      'Suggestions are optional examples. They do not assert your skills or guarantee job eligibility.',
  }
}
