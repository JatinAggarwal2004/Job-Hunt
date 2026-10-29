const origin = process.env.APP_ORIGIN || 'http://127.0.0.1:3001'
const results = []
for (const path of ['/api/health', '/api/ready']) {
  const response = await fetch(new URL(path, origin), {
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  })
  const body = await response.json()
  results.push({ path, status: response.status, ...body })
}
console.log(JSON.stringify(results, null, 2))
if (results.some((r) => r.status !== 200)) process.exitCode = 1
