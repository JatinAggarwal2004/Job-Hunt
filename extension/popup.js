import { fillContactFields } from './autofill.js'
function workspaceOrigin(value) {
  const url = new URL(value)
  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !(url.protocol === 'https:' || url.origin === 'http://127.0.0.1:3001')
  )
    throw new Error('Use an HTTPS workspace origin, or the default local API address.')
  return url.origin
}
let origin = 'http://127.0.0.1:3001'
const status = document.querySelector('#status')
let profile = null
async function connect(token) {
  if (!token || token.length < 20)
    throw new Error('Copy a fresh connection token from Job-Hunter Settings.')
  const response = await fetch(`${origin}/api/extension/profile`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
    credentials: 'omit',
  })
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? 'Token expired or revoked. Create a new one in Settings.'
        : 'Access unavailable. Check your membership, verification and workspace server.',
    )
  const data = await response.json()
  profile = data.profile ?? data
  if (!profile || typeof profile.name !== 'string')
    throw new Error('Unexpected profile response. Update the assistant and try again.')
  await chrome.storage.session.set({ jobHunterToken: token, jobHunterOrigin: origin })
  document.querySelector('#identity').textContent = `Connected as ${profile.name}`
  document.querySelector('#connected').hidden = false
  status.textContent = 'Connected. Open the application page and choose Fill contact fields.'
}
document.querySelector('#connect').addEventListener('click', async (event) => {
  event.currentTarget.disabled = true
  try {
    origin = workspaceOrigin(document.querySelector('#origin').value.trim())
    if (
      origin.startsWith('https:') &&
      !(await chrome.permissions.request({ origins: [`${origin}/*`] }))
    )
      throw new Error('Workspace connection permission was declined.')
    await connect(document.querySelector('#token').value.trim())
  } catch (error) {
    status.textContent = error.message || 'Could not connect to local Job-Hunter.'
  } finally {
    document.querySelector('#connect').disabled = false
  }
})
document.querySelector('#fill').addEventListener('click', async (event) => {
  event.currentTarget.disabled = true
  try {
    // Refresh the profile every time so revoked tokens cannot keep filling with cached data.
    const { jobHunterToken } = await chrome.storage.session.get('jobHunterToken')
    await connect(jobHunterToken)
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id || !/^https?:\/\//.test(tab.url || ''))
      throw new Error(
        'Open a normal application web page first. Browser settings pages cannot be filled.',
      )
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fillContactFields,
      args: [profile],
    })
    const result = results[0]?.result
    status.textContent = result?.filled
      ? `Filled ${result.filled} contact fields. Review them before submitting. Nothing was submitted.`
      : 'No supported empty fields found. Existing values, embedded frames and custom controls are left for you to review.'
  } catch (error) {
    status.textContent = error.message || 'Could not fill this page.'
  } finally {
    document.querySelector('#fill').disabled = false
  }
})
document.querySelector('#disconnect').addEventListener('click', async () => {
  await chrome.storage.session.remove(['jobHunterToken', 'jobHunterOrigin'])
  profile = null
  document.querySelector('#token').value = ''
  document.querySelector('#connected').hidden = true
  status.textContent = 'Disconnected. Revoke the token in Settings to invalidate it everywhere.'
})
const saved = await chrome.storage.session.get(['jobHunterToken', 'jobHunterOrigin'])
origin = workspaceOrigin(saved.jobHunterOrigin || origin)
document.querySelector('#origin').value = origin
if (saved.jobHunterToken)
  try {
    await connect(saved.jobHunterToken)
  } catch (error) {
    status.textContent = error.message
  }
