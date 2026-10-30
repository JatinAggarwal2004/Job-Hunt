import type { Source, Job, Profile, SearchCoverage } from '../shared/types.ts'
import { createHash } from 'node:crypto'
import { hasSkill } from './resume.ts'
import { decodeHTML } from 'entities'
export type RawJob = Omit<Job, 'matchScore' | 'matchReasons' | 'status'>
const clean = (v: unknown) =>
  decodeHTML(decodeHTML(String(v ?? '')))
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
export function sourceUrl(s: Source) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(s.slug) && s.type !== 'arbeitnow')
    throw Error('Invalid board identifier')
  switch (s.type) {
    case 'arbeitnow':
      return 'https://www.arbeitnow.com/api/job-board-api'
    case 'greenhouse':
      return `https://boards-api.greenhouse.io/v1/boards/${s.slug}/jobs?content=true`
    case 'lever':
      return `https://api.lever.co/v0/postings/${s.slug}?mode=json`
    case 'ashby':
      return `https://api.ashbyhq.com/posting-api/job-board/${s.slug}?includeCompensation=true`
    default:
      throw Error('Unsupported source')
  }
}
export async function limitedJson(url: string, fetcher: typeof fetch = fetch, timeout = 15000) {
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(timeout),
    redirect: 'error',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw Error(`Source returned HTTP ${response.status}`)
  if (Number(response.headers.get('content-length')) > 8_000_000)
    throw Error('Source response too large')
  const reader = response.body?.getReader()
  if (!reader) throw Error('Empty response')
  const parts: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > 8_000_000) {
      await reader.cancel()
      throw Error('Source response too large')
    }
    parts.push(value)
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'))
}
async function collectPage(
  source: Source,
  limit: number,
  fetcher: typeof fetch = fetch,
  page = 1,
): Promise<{ jobs: RawJob[]; more: boolean }> {
  const url = new URL(sourceUrl(source))
  if (page > 1) url.searchParams.set('page', String(page))
  const data = await limitedJson(url.toString(), fetcher)
  const items =
    source.type === 'arbeitnow'
      ? data.data
      : source.type === 'greenhouse'
        ? data.jobs
        : source.type === 'ashby'
          ? data.jobs
          : data
  if (!Array.isArray(items)) throw Error('Unexpected source response')
  const jobs = items.slice(0, limit).flatMap((j: any) => {
    const url = j.url || j.absolute_url || j.hostedUrl || j.jobUrl
    try {
      const u = new URL(url)
      if (u.protocol !== 'https:') return []
    } catch {
      return []
    }
    const company = clean(
      j.company_name || (source.type === 'greenhouse' ? j.company_name : null) || source.name,
    )
    const title = clean(j.title || j.text)
    if (!title) return []
    const compensation = j.compensation?.summaryComponents?.find(
      (c: any) => c.compensationType === 'Salary' && c.interval === '1 YEAR',
    )
    const salary = j.salaryRange?.interval === 'year' ? j.salaryRange : compensation
    const posted = j.created_at
      ? new Date(typeof j.created_at === 'number' ? j.created_at * 1000 : j.created_at)
      : j.publishedAt
        ? new Date(j.publishedAt)
        : j.createdAt
          ? new Date(j.createdAt)
          : null
    return [
      {
        id: createHash('sha256').update(canonicalJobUrl(url)).digest('hex').slice(0, 24),
        title,
        company,
        location: clean(j.location?.name || j.categories?.location || j.location || ''),
        remote: !!(
          j.remote ||
          j.isRemote ||
          String(j.workplaceType).toLowerCase() === 'remote' ||
          /\bremote\b/i.test(j.location?.name || j.categories?.location || j.location || '')
        ),
        url,
        description: clean(j.descriptionPlain || j.description || j.content || j.descriptionHtml),
        source: source.id,
        postedAt: posted && !isNaN(posted.getTime()) ? posted.toISOString() : null,
        fetchedAt: new Date().toISOString(),
        salaryMin: Number.isFinite(salary?.min ?? salary?.minValue)
          ? (salary.min ?? salary.minValue)
          : null,
        salaryMax: Number.isFinite(salary?.max ?? salary?.maxValue)
          ? (salary.max ?? salary.maxValue)
          : null,
        currency: salary?.currency || salary?.currencyCode || null,
        companySize: null,
      },
    ]
  })
  return {
    jobs,
    more: items.length > limit || (source.type === 'arbeitnow' && Boolean(data.links?.next)),
  }
}
export async function collectWithCoverage(
  source: Source,
  limit: number,
  fetcher: typeof fetch = fetch,
) {
  const jobs = new Map<string, RawJob>()
  const coverage: SearchCoverage = {
    source: source.id,
    name: source.name,
    status: 'completed',
    pages: 0,
    jobs: 0,
    queries: [],
    omittedQueries: 0,
    note: '',
  }
  let more = false
  do {
    try {
      const result = await collectPage(source, limit - jobs.size, fetcher, coverage.pages + 1)
      coverage.pages++
      for (const job of result.jobs) jobs.set(job.id, job)
      more = result.more
    } catch (error) {
      if (!coverage.pages) throw error
      more = true
      coverage.note = 'A later feed page failed; earlier results were retained.'
      break
    }
  } while (source.type === 'arbeitnow' && more && jobs.size < limit && coverage.pages < 5)
  coverage.jobs = jobs.size
  coverage.status = more ? 'limited' : 'completed'
  coverage.note ||= more
    ? 'Stopped at the feed page or result limit; coverage is incomplete.'
    : 'Checked this connected feed or company board; this is not the whole web.'
  return { jobs: [...jobs.values()], coverage }
}
export async function collect(
  source: Source,
  limit: number,
  fetcher: typeof fetch = fetch,
): Promise<RawJob[]> {
  return (await collectWithCoverage(source, limit, fetcher)).jobs
}
export function match(
  job: RawJob,
  profile: Profile,
): { score: number; reasons: string[]; eligible: boolean } {
  const text = `${job.title} ${job.description}`.toLowerCase()
  const reasons: string[] = []
  let score = 0
  let possible = 0
  let eligible = true
  if (profile.roles.length) {
    possible += 40
    const hits = profile.roles.filter((r) => roleMatches(job.title, r))
    if (hits.length) {
      score += 40
      reasons.push(`Role: ${hits.join(', ')}`)
    } else eligible = false
  }
  if (profile.skills.length) {
    possible += 30
    const hits = profile.skills.filter((s) => hasSkill(text, s))
    score += Math.round((30 * hits.length) / profile.skills.length)
    if (hits.length) reasons.push(`Skills: ${hits.join(', ')}`)
  }
  if (profile.remoteOnly && !job.remote) eligible = false
  if (profile.locations.length) {
    possible += 20
    if (
      profile.locations.some((l) => hasSkill(normalizeLocation(job.location), normalizeLocation(l)))
    ) {
      score += 20
      reasons.push('Preferred location')
    } else if (job.remote && /\b(worldwide|anywhere|global|everywhere)\b/i.test(job.location)) {
      reasons.push('Listed as worldwide remote; verify eligibility with the employer')
    } else {
      eligible = false
      reasons.push('Location does not match; remote does not imply worldwide eligibility')
    }
  }
  if (profile.remoteOnly && job.remote) {
    possible += 10
    score += 10
    reasons.push('Remote')
  }
  if (job.salaryMin === null) {
    reasons.push('Salary undisclosed')
    if (profile.salaryMin > 0 && !profile.includeUnknownSalary) eligible = false
  } else if (
    profile.salaryMin > 0 &&
    (job.currency !== profile.currency || (job.salaryMax ?? job.salaryMin) < profile.salaryMin)
  )
    eligible = false
  const levels = profile.experienceLevels?.length
    ? profile.experienceLevels
    : profile.experience
      ? [profile.experience]
      : []
  if (levels.length) {
    const title = job.title.toLowerCase()
    const level = /intern|trainee|apprentice/.test(title)
      ? 'Internship'
      : /\blead\b|head of|director|principal/.test(title)
        ? 'Lead'
        : /senior|\bsr\b|staff/.test(title)
          ? 'Senior'
          : /junior|\bjr\b|entry|graduate|fresher|associate/.test(title)
            ? 'Entry level'
            : /mid.level|intermediate/.test(title)
              ? 'Mid level'
              : null
    if (level && !levels.includes(level)) eligible = false
    reasons.push(
      level ? `Experience: ${level}` : 'Experience not stated in title; check the full description',
    )
  }
  if (
    profile.companySizes.length &&
    job.companySize &&
    !profile.companySizes.includes(job.companySize)
  )
    eligible = false
  if (profile.companySizes.length) reasons.push('Company size unavailable; verify before applying')
  if (!possible) reasons.push('Set interests and skills to personalize matching')
  return { score: possible ? Math.round((score / possible) * 100) : 0, reasons, eligible }
}

export function roleMatches(title: string, role: string) {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/front[ -]?end/g, 'frontend')
      .replace(/back[ -]?end/g, 'backend')
      .replace(/full[ -]?stack/g, 'fullstack')
      .replace(/software developer/g, 'software engineer')
      .replace(/frontend developer/g, 'frontend engineer')
      .replace(/backend developer/g, 'backend engineer')
      .replace(/fullstack developer/g, 'fullstack engineer')
  const hay = normalize(title),
    needle = normalize(role)
  if (hasSkill(hay, needle)) return true
  const tokens = needle
    .split(/[^a-z0-9+#]+/)
    .filter(
      (t) =>
        t.length > 1 &&
        ![
          'senior',
          'junior',
          'entry',
          'level',
          'intern',
          'internship',
          'engineer',
          'developer',
          'and',
          'or',
          'the',
        ].includes(t),
    )
  return tokens.length > 0 && tokens.every((t) => hasSkill(hay, t))
}

function normalizeLocation(s: string) {
  return s
    .toLowerCase()
    .replace(/\b(usa|u\.s\.a\.?|us)\b/g, 'united states')
    .replace(/\buk\b/g, 'united kingdom')
    .replace(/\bbangalore\b/g, 'bengaluru')
    .replace(/\bgurgaon\b/g, 'gurugram')
    .replace(/\b(new delhi|noida|gurugram)\b/g, '$1 delhi ncr')
}

export function canonicalJobUrl(value: string) {
  const u = new URL(value)
  for (const key of [...u.searchParams.keys()])
    if (key.startsWith('utm_') || key === 'gh_src') u.searchParams.delete(key)
  u.searchParams.sort()
  u.hash = ''
  return u.toString()
}
