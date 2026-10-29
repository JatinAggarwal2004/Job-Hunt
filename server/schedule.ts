import type { Profile } from '../shared/types.ts'
const formatters = new Map<string, Intl.DateTimeFormat>()
export function scheduleParts(p: Pick<Profile, 'timezone'>, date: Date) {
  let formatter = formatters.get(p.timezone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: p.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    formatters.set(p.timezone, formatter)
  }
  const parts = formatter.formatToParts(date),
    part = (t: string) => parts.find((x) => x.type === t)?.value || ''
  return {
    day: ['year', 'month', 'day'].map(part).join('-'),
    hour: Number(part('hour')),
    minute: Number(part('minute')),
  }
}
export function nextDailyRun(p: Profile, lastDay: string | null, date = new Date()): string | null {
  if (!p.scheduleEnabled) return null
  const local = scheduleParts(p, date)
  if (local.hour >= p.scheduleHour && lastDay !== local.day) return date.toISOString()
  const start = Math.floor(date.getTime() / 60000) * 60000
  for (let minute = 1; minute <= 49 * 60; minute++) {
    const candidate = new Date(start + minute * 60000),
      parts = scheduleParts(p, candidate)
    if (parts.hour === p.scheduleHour && parts.minute === 0 && parts.day !== lastDay)
      return candidate.toISOString()
  }
  return null
}
