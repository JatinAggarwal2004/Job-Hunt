import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import type { Profile, SearchCoverage } from '../shared/types.ts'
import { canonicalJobUrl, limitedJson, type RawJob } from './sources.ts'

export const WEB_SOURCE_ID = 'web-google-jobs'
const MAX_REQUESTS = 6
const MAX_PAGES = 2
const clean = (value: unknown) =>
  String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
function publicLink(value: unknown): string | null {
  try {
    const url = new URL(String(value))
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      isIP(url.hostname) ||
      !url.hostname.includes('.') ||
      /\.(local|internal|localhost)$/i.test(url.hostname)
    )
      return null
    return canonicalJobUrl(url.toString())
  } catch {
    return null
  }
}

export function normalizeIndexedJobs(items: unknown[], limit: number): RawJob[] {
  if (limit <= 0) return []
  const jobs = new Map<string, RawJob>()
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, any>
    const links = (Array.isArray(item.apply_options) ? item.apply_options : [])
      .flatMap((option: any) => {
        const url = publicLink(option?.link)
        return url
          ? [{ name: clean(option.title).slice(0, 120) || new URL(url).hostname, url }]
          : []
      })
      .slice(0, 10)
    const url = links[0]?.url || publicLink(item.share_link)
    const title = clean(item.title),
      company = clean(item.company_name)
    if (!url || !title || !company) continue
    const id = createHash('sha256')
      .update('google_jobs:' + url)
      .digest('hex')
      .slice(0, 24)
    jobs.set(id, {
      id,
      title,
      company,
      location: clean(item.location),
      source: WEB_SOURCE_ID,
      remote:
        item.detected_extensions?.work_from_home === true ||
        /\b(remote|anywhere|worldwide)\b/i.test(String(item.location)),
      url,
      description: clean(item.description),
      via: clean(item.via).slice(0, 120),
      applyLinks: links,
      postedAt: null,
      fetchedAt: new Date().toISOString(),
      salaryMin: null,
      salaryMax: null,
      currency: null,
      companySize: null,
    })
    if (jobs.size >= limit) break
  }
  return [...jobs.values()]
}

export function createWebDiscovery(
  db: DatabaseSync,
  env: NodeJS.ProcessEnv,
  fetcher: typeof fetch,
) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS web_search_budget(period TEXT PRIMARY KEY,used INTEGER NOT NULL)',
  )
  const configured = Boolean(env.SERPAPI_API_KEY && env.ENABLE_WEB_DISCOVERY === 'true')
  const monthlyCap = Math.min(
    250,
    Math.max(1, Math.floor(Number(env.WEB_SEARCH_MONTHLY_CAP) || 200)),
  )
  const status = () => ({
    configured,
    monthlyCap,
    maxRequestsPerRun: MAX_REQUESTS,
    maxPagesPerQuery: MAX_PAGES,
  })
  const provider = async (
    path: 'account.json' | 'search.json',
    params: Record<string, string> = {},
  ) => {
    const url = new URL(path, 'https://serpapi.com/')
    url.search = new URLSearchParams({ ...params, api_key: env.SERPAPI_API_KEY! }).toString()
    try {
      const data = await limitedJson(url.toString(), fetcher)
      if (data.error) throw Error('provider_error')
      return data
    } catch {
      throw Error(
        'Web index request failed. Check the provider key, quota and availability; no private response details were retained.',
      )
    }
  }
  const search = async (profile: Profile, limit: number) => {
    if (!configured)
      throw Error(
        'Wider web discovery is not configured. The administrator must connect a Free SerpApi account.',
      )
    const roles = [...new Set(profile.roles.map((s) => s.trim()).filter(Boolean))]
    if (!roles.length)
      throw Error('Add at least one role in Search & profile before searching the web index.')
    const locations = profile.locations.length ? profile.locations : [profile.location || '']
    const plan = roles.flatMap((role) =>
      locations.map((location) => ({
        q: `${role} jobs${location ? ` in ${location}` : ''}${profile.remoteOnly ? ' remote' : ''}`,
        token: '',
        seen: new Set<string>(),
        pages: 0,
        more: true,
      })),
    )
    const account = await provider('account.json')
    if (account.plan_monthly_price !== 0 || account.account_status !== 'Active')
      throw Error(
        'Web discovery requires a verified active $0 provider plan. Paid or unknown plans are disabled.',
      )
    const remaining = Number(account.plan_searches_left)
    if (!Number.isFinite(remaining) || remaining <= 0)
      throw Error('The web index Free allowance is exhausted. Existing results are retained.')
    const renewal = account.plan_renewal_date || new Date().toISOString().slice(0, 7)
    const period =
      createHash('sha256').update(String(account.account_id)).digest('hex') + ':' + renewal
    db.prepare('INSERT OR IGNORE INTO web_search_budget VALUES(?,0)').run(period)
    const coverage: SearchCoverage = {
      source: WEB_SOURCE_ID,
      name: 'Google Jobs web index',
      status: 'completed',
      pages: 0,
      jobs: 0,
      queries: [],
      omittedQueries: 0,
      note: '',
    }
    const jobs = new Map<string, RawJob>()
    let requests = 0
    for (let round = 0; round < MAX_PAGES && requests < MAX_REQUESTS; round++) {
      for (const query of plan) {
        if (requests >= MAX_REQUESTS || requests >= remaining || jobs.size >= limit) break
        if (!query.more) continue
        const reserved = db
          .prepare('UPDATE web_search_budget SET used=used+1 WHERE period=? AND used<?')
          .run(period, monthlyCap)
        if (!reserved.changes) {
          coverage.note = 'The shared monthly web-search budget is exhausted.'
          break
        }
        requests++
        try {
          const data = await provider('search.json', {
            engine: 'google_jobs',
            hl: 'en',
            q: query.q,
            ...(query.token ? { next_page_token: query.token } : {}),
          })
          if (!Array.isArray(data.jobs_results) && data.jobs_results !== undefined)
            throw Error('invalid_jobs')
          query.pages++
          coverage.pages++
          if (!coverage.queries.includes(query.q)) coverage.queries.push(query.q)
          if ((data.jobs_results || []).length > limit - jobs.size)
            coverage.note = 'The configured result limit truncated an index page.'
          for (const job of normalizeIndexedJobs(data.jobs_results || [], limit - jobs.size))
            jobs.set(job.id, job)
          const next = data.serpapi_pagination?.next_page_token
          if (typeof next === 'string' && query.seen.has(next))
            coverage.note = 'The index repeated a page token; pagination stopped safely.'
          query.more =
            typeof next === 'string' &&
            next.length > 0 &&
            next.length < 8192 &&
            !query.seen.has(next)
          if (query.more) {
            query.seen.add(next)
            query.token = next
          }
        } catch {
          coverage.note =
            'Some web-index requests failed. Earlier results were retained; retry after checking provider availability.'
          query.more = false
        }
      }
      if (coverage.note) break
    }
    coverage.omittedQueries = plan.filter((q) => !q.pages).length
    coverage.jobs = jobs.size
    if (!coverage.pages)
      throw Error(coverage.note || 'No web queries could run within the available budget.')
    if (coverage.note || coverage.omittedQueries || plan.some((q) => q.more))
      coverage.status = 'limited'
    coverage.note ||=
      coverage.status === 'limited'
        ? 'Search stopped at a query, page, result or Free-usage limit. This is not a complete web search.'
        : 'Searched the Google Jobs index. Unindexed and inaccessible platform listings are not covered; verify openings with the employer.'
    return { jobs: [...jobs.values()], coverage }
  }
  return { status, search }
}
