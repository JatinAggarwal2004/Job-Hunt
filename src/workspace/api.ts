export class ApiError extends Error {
  status: number
  constructor(
    message: string,
    status: number,
    public code?: string,
  ) {
    super(message)
    this.status = status
  }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const form = body instanceof FormData
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body && !form ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? (form ? body : JSON.stringify(body)) : undefined,
  })
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new ApiError(
      'The backend is unavailable. Start the local server with npm run dev, then try again.',
      502,
    )
  const data = await response
    .json()
    .catch(() => ({ error: 'The server returned an unexpected response. Please try again.' }))
  if (!response.ok)
    throw new ApiError(data.error || 'Something went wrong.', response.status, data.code)
  return data as T
}
