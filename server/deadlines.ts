export function employerDeadline(value: unknown, description = ''): string | null {
  const raw =
    typeof value === 'string'
      ? value.trim()
      : description.match(
          /\b(?:application deadline|apply by|closing date|applications close)\s*[:–-]?\s*(\d{4}-\d{2}-\d{2}(?:T[^\s<]+)?)/i,
        )?.[1] || ''
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}.*)?$/.test(raw) || !Number.isFinite(Date.parse(raw)))
    return null
  if (raw.length === 10 && new Date(raw).toISOString().slice(0, 10) !== raw) return null
  return raw.length === 10 ? raw : new Date(raw).toISOString()
}
