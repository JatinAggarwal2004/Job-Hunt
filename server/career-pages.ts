import { createHash } from 'node:crypto'
import { decodeHTML } from 'entities'
import type { Source } from '../shared/types.ts'
import { careerUrl } from './career-fetch.ts'
import type { RawJob } from './sources.ts'
export type Board = { name: string; type: 'greenhouse' | 'lever' | 'ashby'; slug: string }
export const starterBoards: Board[] = [
  { name: 'Stripe', type: 'greenhouse', slug: 'stripe' },
  { name: 'Enterpret', type: 'greenhouse', slug: 'enterpret' },
  { name: 'Forma.ai India Campus', type: 'greenhouse', slug: 'formaaiinc3' },
  { name: 'Instawork', type: 'greenhouse', slug: 'instawork' },
  { name: 'SuperApp', type: 'greenhouse', slug: 'superapp' },
  { name: 'Razorpay', type: 'greenhouse', slug: 'razorpaysoftwareprivatelimited' },
  ...['sarvam', 'aiprise', 'firstwork', 'notion', 'Commure', 'sardine', 'playpowerlabs'].map(
    (slug) => ({ name: slug, type: 'ashby' as const, slug }),
  ),
]
export function detectBoard(value: string): Board | null {
  let url: URL
  try {
    url = careerUrl(value)
  } catch {
    return null
  }
  let type: Board['type']
  if (['boards.greenhouse.io', 'job-boards.greenhouse.io'].includes(url.hostname))
    type = 'greenhouse'
  else if (url.hostname === 'jobs.lever.co') type = 'lever'
  else if (url.hostname === 'jobs.ashbyhq.com') type = 'ashby'
  else if (url.hostname === 'stripe.com' && /^\/(careers|jobs)(\/|$)/.test(url.pathname))
    return { name: 'Stripe', type: 'greenhouse', slug: 'stripe' }
  else return null
  const slug = url.pathname.split('/').filter(Boolean)[0]
  return /^[a-zA-Z0-9_-]{1,100}$/.test(slug || '') ? { name: slug, type, slug } : null
}
export function pageLinks(html: string, base: string) {
  const links = new Set<string>()
  for (const match of html.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
    try {
      links.add(careerUrl(new URL(decodeHTML(match[1]), base).toString()).toString())
    } catch {
      /* Ignore non-public links. */
    }
    if (links.size >= 500) break
  }
  return [...links]
}
const clean = (v: unknown) =>
  decodeHTML(String(v || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
export function structuredJobs(
  html: string,
  base: string,
  source: Source,
  limit: number,
): RawJob[] {
  const jobs = new Map<string, RawJob>()
  const visit = (item: any, depth = 0) => {
    if (!item || typeof item !== 'object' || depth > 8 || jobs.size >= limit) return
    if (Array.isArray(item)) {
      for (const node of item.slice(0, 1000)) visit(node, depth + 1)
      return
    }
    if ([item['@type']].flat().includes('JobPosting')) {
      try {
        const url = careerUrl(new URL(item.url || base, base).toString()).toString()
        const title = clean(item.title),
          company = clean(item.hiringOrganization?.name)
        if (
          !title ||
          !company ||
          (item.validThrough && new Date(item.validThrough).getTime() < Date.now())
        )
          return
        const places = [item.jobLocation]
          .flat()
          .filter(Boolean)
          .map((p: any) =>
            [
              p.address?.addressLocality,
              p.address?.addressRegion,
              typeof p.address?.addressCountry === 'object'
                ? p.address.addressCountry.name
                : p.address?.addressCountry,
            ]
              .filter(Boolean)
              .join(', '),
          )
        const requirements = [item.applicantLocationRequirements]
          .flat()
          .filter(Boolean)
          .map((p: any) => clean(p.name))
        const location = [...places, ...requirements].filter(Boolean).join(' · ')
        const id = createHash('sha256').update(url).digest('hex').slice(0, 24)
        jobs.set(id, {
          id,
          title,
          company,
          location,
          source: source.id,
          url,
          remote: item.jobLocationType === 'TELECOMMUTE',
          description: clean(item.description),
          postedAt:
            item.datePosted && Number.isFinite(Date.parse(item.datePosted))
              ? new Date(item.datePosted).toISOString()
              : null,
          fetchedAt: new Date().toISOString(),
          salaryMin: null,
          salaryMax: null,
          currency: null,
          companySize: null,
          via: 'Employer career page',
        })
      } catch {
        /* Malformed job data is not a job. */
      }
    }
    if (item['@graph']) visit(item['@graph'], depth + 1)
    if (item.itemListElement) visit(item.itemListElement, depth + 1)
    if (item.item) visit(item.item, depth + 1)
  }
  for (const match of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      visit(JSON.parse(match[1]))
    } catch {
      /* Keep other valid data blocks. */
    }
  }
  return [...jobs.values()]
}
