import { useEffect, useRef } from 'react'
import type { ActivityPage } from '../../shared/activity'
const HEARTBEAT_MS = 30000
const IDLE_MS = 5 * 60000
/** First-party, signed-in presence only. Never reads location, inputs or document contents. */
export function useActivityPixel(userId: string | undefined, page: ActivityPage, enabled: boolean) {
  const lastInput = useRef(Date.now())
  const view = useRef({ key: '', id: '' })
  const tab = useRef('')
  useEffect(() => {
    if (!userId || !enabled) return
    if (!tab.current) tab.current = crypto.randomUUID()
    lastInput.current = Date.now()
    const key = `${userId}:${page}`
    if (view.current.key !== key) view.current = { key, id: crypto.randomUUID() }
    function send(type: 'page_view' | 'heartbeat' | 'inactive') {
      const idleMs = Math.min(IDLE_MS, Math.max(0, Date.now() - lastInput.current))
      const inactive =
        document.visibilityState !== 'visible' || idleMs >= IDLE_MS || type === 'inactive'
      const payload = JSON.stringify({
        id: type === 'page_view' ? view.current.id : crypto.randomUUID(),
        tabId: tab.current,
        type: inactive ? 'inactive' : type,
        page,
        idleMs,
      })
      if (
        navigator.sendBeacon?.('/api/activity', new Blob([payload], { type: 'application/json' }))
      )
        return
      void fetch('/api/activity', {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      }).catch(() => {})
    }
    const input = (event: Event) => {
      if (event.isTrusted) lastInput.current = Date.now()
    }
    const visible = () => {
      if (document.visibilityState === 'visible') lastInput.current = Date.now()
      send('heartbeat')
    }
    const leaving = () => send('inactive')
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    events.forEach((event) => window.addEventListener(event, input, { passive: true }))
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('pagehide', leaving)
    send('page_view')
    let inactiveSent = false
    const timer = setInterval(() => {
      const inactive =
        document.visibilityState !== 'visible' || Date.now() - lastInput.current >= IDLE_MS
      if (!inactive || !inactiveSent) send('heartbeat')
      inactiveSent = inactive
    }, HEARTBEAT_MS)
    return () => {
      clearInterval(timer)
      events.forEach((event) => window.removeEventListener(event, input))
      document.removeEventListener('visibilitychange', visible)
      window.removeEventListener('pagehide', leaving)
    }
  }, [userId, page, enabled])
}
