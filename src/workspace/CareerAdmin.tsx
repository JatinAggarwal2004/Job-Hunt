import { useEffect, useState } from 'react'
import { api } from './api'
export function CareerAdmin({
  enabled,
  changed,
  act,
  busy,
}: {
  enabled: boolean
  changed: () => Promise<void>
  act: (work: () => Promise<void>, success?: string) => Promise<void>
  busy: boolean
}) {
  const [url, setUrl] = useState(''),
    [sites, setSites] = useState<string[]>([])
  const load = async () => setSites((await api<{ sites: string[] }>('/admin/career-sites')).sites)
  useEffect(() => {
    void act(load)
  }, [])
  return (
    <section className="ws-panel">
      <div className="ws-section-top">
        <h2>Let the search find companies, too.</h2>
      </div>
      <p>
        Check Amazon careers, Stripe and a starter registry of startup boards automatically.
        Supported employer links found in your web results expand that scan. You don’t need a board
        identifier.
      </p>
      <p className="ws-muted">
        Bounded per scan: 20 hiring boards, 4 additional career URLs and 3,000 unique listings.
        Amazon uses up to 6 pages across 3 roles. Feeds read up to 1,000 jobs each. Shared reads are
        cached for 15 minutes. This is broader discovery, not the entire web.
      </p>
      <label className="ws-check">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(e) => {
            const enabled = e.target.checked
            void act(
              async () => {
                await api('/admin/career-discovery', 'POST', { enabled })
                await changed()
              },
              enabled
                ? 'Automatic career discovery enabled. Your next scan includes employer sites.'
                : 'Automatic career discovery paused.',
            )
          }}
        />{' '}
        Automatic employer & startup discovery
      </label>
      <form
        className="ws-source-form"
        onSubmit={(e) => {
          e.preventDefault()
          void act(async () => {
            await api('/admin/career-sites', 'POST', { url })
            setUrl('')
            await load()
          }, 'Career URL added. The next scan detects its hiring board or reads public job data.')
        }}
      >
        <label htmlFor="career-url">Additional employer careers URL (optional)</label>
        <input
          id="career-url"
          type="url"
          value={url}
          required
          maxLength={2000}
          placeholder="https://company.com/careers"
          onChange={(e) => setUrl(e.target.value)}
        />
        <p className="ws-muted">
          Useful for a company you want to follow. JavaScript-only or blocked pages may need a
          dedicated connector; coverage shows the outcome.
        </p>
        <button className="ws-button" disabled={busy}>
          Add careers URL
        </button>
      </form>
      {sites.map((site) => (
        <div className="ws-row" key={site}>
          <span style={{ overflowWrap: 'anywhere' }}>{site}</span>
          <button
            className="ws-button"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await api('/admin/career-sites', 'DELETE', { url: site })
                await load()
              })
            }
          >
            Remove URL
          </button>
        </div>
      ))}
    </section>
  )
}
