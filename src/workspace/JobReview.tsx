import { useEffect, useState } from 'react'
import { Check, FileText, LoaderCircle } from 'lucide-react'
import type { Analysis, Job, Resume } from '../../shared/types'
import type { JobResumeReview } from '../../shared/matching'
import { api } from './api'
import { ResumeIntake } from './ResumeIntake'
export function JobReview({
  job,
  aiAvailable = false,
  provider = 'ollama',
}: {
  job: Job
  aiAvailable?: boolean
  provider?: string
}) {
  const [resumes, setResumes] = useState<Resume[]>([]),
    [ids, setIds] = useState<string[]>([]),
    [reviews, setReviews] = useState<(JobResumeReview & { wording?: Analysis })[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [ai, setAi] = useState(false),
    [consent, setConsent] = useState(false)
  const load = async () => setResumes((await api<{ resumes: Resume[] }>('/resumes')).resumes)
  useEffect(() => {
    void load().catch((e) => setError(e.message))
  }, [])
  return (
    <section className="jh-review">
      <h3>The right resume for this role</h3>
      <p className="ws-muted">
        Compare up to 5 of your own versions against {job.title}. Every score links to document
        evidence.
      </p>
      {!resumes.length ? (
        <ResumeIntake
          onUploaded={async () => {
            await load()
          }}
        />
      ) : (
        <div className="jh-resume-options">
          {resumes.map((r) => (
            <label key={r.id}>
              <input
                type="checkbox"
                checked={ids.includes(r.id)}
                disabled={busy || (!ids.includes(r.id) && ids.length >= 5)}
                onChange={(e) => {
                  setIds((old) =>
                    e.target.checked ? [...old, r.id] : old.filter((id) => id !== r.id),
                  )
                  setReviews([])
                }}
              />
              <FileText size={16} />
              <span>{r.filename}</span>
            </label>
          ))}
        </div>
      )}
      {aiAvailable && (
        <>
          <label className="ws-check">
            <input
              type="checkbox"
              checked={ai}
              onChange={(e) => setAi(e.target.checked)}
              disabled={busy}
            />{' '}
            Also request model-assisted wording suggestions
          </label>
          {ai && provider === 'gemini' && (
            <label className="ws-check">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />{' '}
              I consent to sending the selected resume text and this job description to Google
              Gemini for this request.
            </label>
          )}
        </>
      )}
      <button
        className="ws-button ws-primary"
        disabled={busy || !ids.length || (ai && provider === 'gemini' && !consent)}
        onClick={() => {
          setBusy(true)
          setError('')
          void api<{ reviews: (JobResumeReview & { wording?: Analysis })[] }>(
            `/jobs/${job.id}/compare-resumes`,
            'POST',
            { resumeIds: ids, useAi: ai, consent },
          )
            .then((r) => setReviews(r.reviews))
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false))
        }}
      >
        {busy ? <LoaderCircle size={16} className="ws-spin" /> : <Check size={16} />}{' '}
        {busy ? 'Reviewing selected resumes…' : 'Compare selected resumes'}
      </button>
      {error && (
        <p role="alert" className="ws-error">
          {error}
        </p>
      )}
      {reviews.map((r, index) => (
        <article className="jh-review-result" key={r.resumeId}>
          <div className="jh-review-result-head">
            <div>
              <small>
                {index === 0 && reviews.length > 1
                  ? 'Highest evidence score among your selected versions'
                  : 'Job-specific review'}
              </small>
              <h3>{r.filename}</h3>
            </div>
            <strong className="jh-review-score">
              {r.score === null ? 'Unassessed' : `${r.score}/100`}
            </strong>
          </div>
          <p className="ws-muted">{r.notice}</p>
          <div className="jh-dimensions">
            {r.dimensions.map((d) => (
              <div key={d.name}>
                <span>{d.name}</span>
                <strong>{d.max ? `${d.score}/${d.max}` : 'Unassessed'}</strong>
                <p>{d.reason}</p>
              </div>
            ))}
          </div>
          <details open>
            <summary>Skill evidence ({r.matchedSkills.length} found)</summary>
            {r.matchedSkills.map((s) => (
              <div className="jh-evidence" key={s.skill}>
                <strong>{s.skill}</strong>
                <p>
                  <small>JOB</small> {s.jobEvidence}
                </p>
                <p>
                  <small>RESUME</small> {s.resumeEvidence}
                </p>
              </div>
            ))}
          </details>
          <details>
            <summary>Skills mentioned in the job but not found ({r.missingSkills.length})</summary>
            {r.missingSkills.map((s) => (
              <div className="jh-evidence" key={s.skill}>
                <strong>{s.skill}</strong>
                <p>{s.jobEvidence}</p>
              </div>
            ))}
          </details>
          <details>
            <summary>Relevant resume passages</summary>
            {r.relevantPassages.map((p, i) => (
              <blockquote key={i}>{p.quote}</blockquote>
            ))}
          </details>
          {r.semanticEvidence && (
            <details>
              <summary>Semantic model evidence · {r.semanticSimilarity}% relatedness</summary>
              {r.semanticEvidence.map((e, i) => (
                <div className="jh-evidence" key={i}>
                  <p>
                    <small>JOB PASSAGE</small> {e.jobQuote}
                  </p>
                  <p>
                    <small>RESUME PASSAGE</small> {e.resumeQuote}
                  </p>
                  <small>Cosine similarity {e.similarity.toFixed(3)} · not a probability</small>
                </div>
              ))}
            </details>
          )}
          <h4>What to improve</h4>
          <ul>
            {r.suggestions.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <details>
            <summary>What this review cannot establish</summary>
            <ul>
              {r.unknowns.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </details>
          {r.wording && (
            <section>
              <h4>Optional wording drafts</h4>
              <p>{r.wording.notice}</p>
              {r.wording.suggestions.map((s) => (
                <div className="jh-evidence" key={s.id}>
                  <strong>{s.title}</strong>
                  <p>{s.detail}</p>
                  {s.before && (
                    <>
                      <p>Original: {s.before}</p>
                      <p>Suggested: {s.after}</p>
                    </>
                  )}
                  <small>
                    Review and edit in Resume studio; your document has not been changed.
                  </small>
                </div>
              ))}
            </section>
          )}
        </article>
      ))}
    </section>
  )
}
