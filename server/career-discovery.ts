import { createHash } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Profile, Source, SearchCoverage } from '../shared/types.ts'
import { collectWithCoverage, canonicalJobUrl, limitedJson, type RawJob } from './sources.ts'
import {
  detectBoard,
  pageLinks,
  starterBoards,
  structuredJobs,
  type Board,
} from './career-pages.ts'
import { careerUrl, readCareerPage } from './career-fetch.ts'
export const CAREER_SOURCE_ID = 'automatic-career-sites'
const MAX_JOBS = 3000,
  MAX_BOARDS = 20,
  MAX_PAGES = 6,
  MAX_CUSTOM = 4
export type CareerCheck = {
  name: string
  status: 'completed' | 'limited' | 'failed'
  jobs: number
  note: string
}
export function createCareerDiscovery(
  db: DatabaseSync,
  fetcher: typeof fetch = fetch,
  pageReader = readCareerPage,
) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS career_cache(key TEXT PRIMARY KEY,at INTEGER NOT NULL,data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS career_sites(url TEXT PRIMARY KEY); CREATE TABLE IF NOT EXISTS career_rotation(id INTEGER PRIMARY KEY,next INTEGER NOT NULL); INSERT OR IGNORE INTO career_rotation VALUES(1,0)',
  )
  const sites = () =>
    (db.prepare('SELECT url FROM career_sites ORDER BY rowid').all() as { url: string }[]).map(
      (r) => r.url,
    )
  const addSite = (value: string) => {
    const url = careerUrl(value).toString()
    if (sites().length >= 20 && !sites().includes(url))
      throw Error('Maximum 20 additional career URLs. Remove an old URL first.')
    db.prepare('INSERT OR IGNORE INTO career_sites VALUES(?)').run(url)
    return url
  }
  async function cached<T>(key: string, work: () => Promise<T>): Promise<T> {
    const row = db.prepare('SELECT at,data FROM career_cache WHERE key=?').get(key) as
      { at: number; data: string } | undefined
    if (row && Date.now() - row.at < 15 * 60 * 1000) return JSON.parse(row.data)
    const result = await work()
    db.prepare(
      'INSERT INTO career_cache VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET at=excluded.at,data=excluded.data',
    ).run(key, Date.now(), JSON.stringify(result))
    db.prepare('DELETE FROM career_cache WHERE at<?').run(Date.now() - 24 * 60 * 60 * 1000)
    return result
  }
  async function search(profile: Profile, indexed: RawJob[]) {
    const cursor = Number(
      (db.prepare('SELECT next FROM career_rotation WHERE id=1').get() as any).next,
    )
    db.prepare('UPDATE career_rotation SET next=next+1 WHERE id=1').run()
    const rotate = <T>(items: T[], count: number) =>
      items.length <= count
        ? items
        : Array.from({ length: count }, (_, i) => items[(cursor * count + i) % items.length])
    const jobs = new Map<string, RawJob>(),
      checks: CareerCheck[] = []
    const boards = new Map<string, Board>(),
      urls = new Set(sites())
    const addBoard = (board: Board) => boards.set(`${board.type}:${board.slug}`, board)
    for (const board of starterBoards) addBoard(board)
    for (const job of indexed)
      for (const link of [{ url: job.url }, ...(job.applyLinks || [])]) {
        const board = detectBoard(link.url)
        if (board) addBoard(board)
        else {
          try {
            const u = careerUrl(link.url)
            if (
              !/(linkedin\.com|indeed\.com|naukri\.com|google\.com|beBee\.com)$/i.test(
                u.hostname,
              ) &&
              /\/(careers?|jobs?|positions?|openings?)(\/|$)/i.test(u.pathname)
            )
              urls.add(u.toString())
          } catch {
            /* Unusable index links are not crawl targets. */
          }
        }
      }
    const source: Source = {
      id: CAREER_SOURCE_ID,
      name: 'Automatic career discovery',
      type: 'career_discovery',
      slug: '',
      enabled: true,
      lastRun: null,
      lastError: null,
      jobCount: 0,
    }
    const addJobs = (found: RawJob[]) => {
      for (const job of found) {
        if (jobs.size >= MAX_JOBS) break
        const url = canonicalJobUrl(job.url)
        jobs.set(url, { ...job, source: CAREER_SOURCE_ID })
      }
    }
    let pages = 0
    for (const value of rotate([...urls], MAX_CUSTOM)) {
      const board = detectBoard(value)
      if (board) {
        addBoard(board)
        continue
      }
      try {
        const result = await cached('page:' + value, async () => {
          const html = await pageReader(value)
          const links = pageLinks(html, value)
          const found = structuredJobs(html, value, source, 300)
          // Follow a few same-origin job detail links; do not crawl arbitrary navigation.
          let fetched = 1
          if (!found.length && !links.some((link) => detectBoard(link))) {
            const origin = new URL(value).origin
            for (const link of links
              .filter(
                (link) =>
                  new URL(link).origin === origin &&
                  link !== value &&
                  /\/(jobs?|careers?|positions?)\/[^/?]+/i.test(new URL(link).pathname),
              )
              .slice(0, 2)) {
              try {
                found.push(...structuredJobs(await pageReader(link), link, source, 100))
                fetched++
              } catch {
                /* Other detail pages can still succeed. */
              }
            }
          }
          return { found, links, fetched }
        })
        pages += result.fetched
        for (const link of result.links) {
          const b = detectBoard(link)
          if (b) addBoard(b)
        }
        addJobs(result.found)
        checks.push({
          name: new URL(value).hostname,
          status: 'limited',
          jobs: result.found.length,
          note: result.links.some((link) => detectBoard(link))
            ? 'Detected a supported hiring board; its feed is checked below.'
            : result.found.length
              ? 'Read public structured job data; bounded page traversal is not complete site coverage.'
              : 'No readable JobPosting data found. JavaScript-only or unsupported career pages remain unchecked.',
        })
      } catch (e) {
        checks.push({
          name: new URL(value).hostname,
          status: 'failed',
          jobs: 0,
          note: (e as Error).message,
        })
      }
    }
    try {
      const amazon = await cached(
        'amazon:' + JSON.stringify([profile.roles, profile.locations]),
        () => amazonJobs(profile, fetcher),
      )
      pages += amazon.pages
      addJobs(amazon.jobs)
      checks.push(amazon.check)
    } catch (e) {
      checks.push({ name: 'Amazon careers', status: 'failed', jobs: 0, note: (e as Error).message })
    }
    for (const board of rotate([...boards.values()], MAX_BOARDS)) {
      if (jobs.size >= MAX_JOBS) break
      try {
        const result = await cached('board:' + board.type + ':' + board.slug, () =>
          collectWithCoverage({ ...source, ...board, id: CAREER_SOURCE_ID }, 1000, fetcher),
        )
        pages += result.coverage.pages
        addJobs(result.jobs)
        checks.push({
          name: board.name,
          status: result.coverage.status,
          jobs: result.jobs.length,
          note:
            result.coverage.status === 'limited'
              ? 'Employer feed exceeded the 1,000-job reading limit.'
              : 'Read supported employer feed (cached up to 15 minutes).',
        })
      } catch (e) {
        checks.push({ name: board.name, status: 'failed', jobs: 0, note: (e as Error).message })
      }
    }
    const omitted = Math.max(0, boards.size - MAX_BOARDS) + Math.max(0, urls.size - MAX_CUSTOM)
    if (checks.length && checks.every((c) => c.status === 'failed'))
      throw Error(
        'All employer career checks failed. Retry later or review the configured career URLs.',
      )
    const coverage: SearchCoverage = {
      source: CAREER_SOURCE_ID,
      name: 'Automatic career discovery',
      status: checks.every((c) => c.status === 'failed') ? 'failed' : 'limited',
      pages,
      jobs: jobs.size,
      queries: [],
      omittedQueries: omitted,
      note: `${checks.length} employer/page checks. Up to ${MAX_BOARDS} boards, ${MAX_CUSTOM} career URLs, ${MAX_JOBS} unique listings per scan. Starter registry plus detected boards; not every company. Targets beyond each scan budget rotate on subsequent scans. Cached reads may be up to 15 minutes old.${jobs.size >= MAX_JOBS ? ' Result budget reached; remaining employers were not fully collected.' : ''}`,
      checks,
    }
    return { jobs: [...jobs.values()], coverage }
  }
  return {
    search,
    sites,
    addSite,
    removeSite: (url: string) => db.prepare('DELETE FROM career_sites WHERE url=?').run(url),
  }
}
export async function amazonJobs(profile: Profile, fetcher: typeof fetch = fetch) {
  const jobs = new Map<string, RawJob>()
  const roles = [...new Set(profile.roles.map((r) => r.trim()).filter(Boolean))].slice(0, 3)
  if (!roles.length)
    throw Error('Choose a role in Search & profile before searching employer careers.')
  const india = profile.locations.some((l) =>
    /india|bengaluru|bangalore|hyderabad|pune|mumbai|delhi|noida|gurugram|chennai|kolkata|kochi|jaipur|ahmedabad|indore|chandigarh/i.test(
      l,
    ),
  )
  let pages = 0,
    limited = profile.roles.length > roles.length
  for (const role of roles) {
    let offset = 0,
      more = true
    while (more && pages < MAX_PAGES) {
      const url = new URL('https://www.amazon.jobs/en/search.json')
      url.search = new URLSearchParams({
        base_query: role,
        result_limit: '100',
        offset: String(offset),
        ...(india
          ? { country: 'IND' }
          : profile.locations[0] && !/worldwide/i.test(profile.locations[0])
            ? { loc_query: profile.locations[0] }
            : {}),
      }).toString()
      let data: any
      try {
        data = await limitedJson(url.toString(), fetcher)
      } catch (error) {
        if (!jobs.size) throw error
        limited = true
        break
      }
      if (!Array.isArray(data.jobs) || data.error)
        throw Error('Amazon returned an unsupported search response.')
      pages++
      for (const item of data.jobs) {
        if (!/^\/en\/jobs\/\d+\//.test(item.job_path || '') || !item.title) continue
        const jobUrl = new URL(item.job_path, 'https://www.amazon.jobs').toString()
        const location =
          String(item.location || '').replace(/^IN,/, 'India,') +
          (item.country_code === 'IND' && !/india|^IN,/i.test(String(item.location))
            ? ', India'
            : '')
        const description = [
          item.description,
          'Qualifications',
          item.basic_qualifications,
          item.preferred_qualifications,
        ]
          .filter(Boolean)
          .join(' ')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
        const id = createHash('sha256').update(canonicalJobUrl(jobUrl)).digest('hex').slice(0, 24)
        jobs.set(id, {
          id,
          title: item.title,
          company: 'Amazon',
          location,
          source: CAREER_SOURCE_ID,
          url: jobUrl,
          description,
          remote: /remote|virtual/i.test(location),
          postedAt: Number.isFinite(Date.parse(item.posted_date))
            ? new Date(item.posted_date).toISOString()
            : null,
          fetchedAt: new Date().toISOString(),
          salaryMin: null,
          salaryMax: null,
          currency: null,
          companySize: null,
          via: 'Amazon careers',
        })
      }
      offset += data.jobs.length
      more = data.jobs.length > 0 && offset < Number(data.hits)
      if (more && pages >= MAX_PAGES) limited = true
    }
    if (pages >= MAX_PAGES) {
      limited = true
      break
    }
  }
  return {
    jobs: [...jobs.values()],
    pages,
    check: {
      name: 'Amazon careers',
      status: limited ? 'limited' : 'completed',
      jobs: jobs.size,
      note: `Direct public career search; ${pages} pages. ${india ? 'India country filter applied.' : 'First preferred location used; worldwide when empty.'} ${limited ? 'A request failed or the six-page/three-role budget was reached; earlier results are retained and more jobs may exist.' : 'Search results exhausted for the queried roles.'}`,
    } satisfies CareerCheck,
  }
}
