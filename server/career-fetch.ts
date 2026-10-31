import { lookup } from 'node:dns/promises'
import { request } from 'node:https'
import { BlockList, isIP } from 'node:net'
const blocked = new BlockList()
for (const [ip, mask] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as [string, number][])
  blocked.addSubnet(ip, mask)
const blockedV6 = new BlockList()
blockedV6.addSubnet('2001::', 23, 'ipv6')
blockedV6.addSubnet('2001:db8::', 32, 'ipv6')
blockedV6.addSubnet('2002::', 16, 'ipv6')
blockedV6.addSubnet('3ffe::', 16, 'ipv6')
blockedV6.addSubnet('3fff::', 20, 'ipv6')
export function publicAddress(address: string) {
  const family = isIP(address)
  if (family === 4) return !blocked.check(address)
  if (family !== 6 || !/^[23][0-9a-f]{3}:/i.test(address)) return false
  return !blockedV6.check(address, 'ipv6')
}
export function careerUrl(value: string) {
  const url = new URL(value)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    isIP(url.hostname.replace(/^\[|\]$/g, '')) ||
    !url.hostname.includes('.') ||
    /\.(local|internal|localhost|test|invalid)$/i.test(url.hostname)
  )
    throw Error('Use a public HTTPS careers URL without credentials or a custom port.')
  url.hash = ''
  return url
}
export function robotsAllowed(text: string, path: string) {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = []
  let group = { agents: [] as string[], rules: [] as { allow: boolean; path: string }[] }
  for (const line of text.split(/\r?\n/).slice(0, 10000)) {
    const match = line.replace(/#.*/, '').match(/^\s*(user-agent|allow|disallow)\s*:\s*(.*?)\s*$/i)
    if (!match) continue
    const key = match[1].toLowerCase(),
      value = match[2]
    if (key === 'user-agent') {
      if (group.rules.length) {
        groups.push(group)
        group = { agents: [], rules: [] }
      }
      group.agents.push(value.toLowerCase())
    } else if (value) group.rules.push({ allow: key === 'allow', path: value })
  }
  groups.push(group)
  const specific = groups.filter((g) => g.agents.includes('jobhunter'))
  const selected = specific.length ? specific : groups.filter((g) => g.agents.includes('*'))
  const matches = selected
    .flatMap((g) => g.rules)
    .filter((r) => {
      const pattern = r.path
        .split('*')
        .map((p) => p.replace(/[.+?^{}()|[\]\\]/g, '\\$&'))
        .join('.*')
        .replace(/\$$/, '$')
      return new RegExp('^' + pattern).test(path)
    })
    .sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow))
  return !matches.length || matches[0].allow
}
export async function publicText(
  value: string,
  resolver = (host: string) => lookup(host, { all: true }),
  transport: typeof request = request,
): Promise<{ status: number; text: string }> {
  const url = careerUrl(value)
  const addresses = await resolver(url.hostname)
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw Error('Careers URL resolves to a private or unsupported network.')
  const address = addresses[0]
  return new Promise((resolve, reject) => {
    const req = transport(
      url,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'JobHunter/1.0',
          Accept: 'text/html,application/json,text/plain',
          'Accept-Encoding': 'identity',
        },
        lookup: (_host, options, callback) => {
          if ((options as any).all) (callback as any)(null, [address])
          else (callback as any)(null, address.address, address.family)
        },
      },
      (res) => {
        const status = res.statusCode || 500
        if (status >= 300 && status < 400) {
          res.destroy()
          reject(Error('Career page redirects. Use its final public careers URL.'))
          return
        }
        let size = 0
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > 2_000_000) {
            res.destroy(Error('Career page exceeds the 2 MB reader limit.'))
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => resolve({ status, text: Buffer.concat(chunks).toString('utf8') }))
        res.on('error', reject)
      },
    )
    const timer = setTimeout(() => req.destroy(Error('Career page timed out.')), 10000)
    req.on('close', () => clearTimeout(timer))
    req.on('error', reject)
    req.end()
  })
}
export async function readCareerPage(value: string, reader = publicText) {
  const url = careerUrl(value)
  const robots = await reader(new URL('/robots.txt', url).toString())
  if (robots.status !== 404 && robots.status !== 200)
    throw Error('Unable to verify career-site crawl access.')
  if (robots.status === 200 && !robotsAllowed(robots.text, url.pathname + url.search))
    throw Error('Career page disallows automated reading.')
  const page = await reader(url.toString())
  if (page.status !== 200) throw Error(`Career page returned HTTP ${page.status}`)
  return page.text
}
