import { useEffect, useState } from 'react'
import { Check, FileText, LoaderCircle, Upload } from 'lucide-react'
import type { Profile, Resume } from '../../shared/types'
import type { ExtractedProfile } from '../../shared/matching'
import { api } from './api'
export function ResumeIntake({
  resumeId,
  onUploaded,
  onApplied,
  onBusyChange,
}: {
  resumeId?: string | null
  onUploaded?: (resume: Resume) => Promise<void> | void
  onApplied?: (profile: Profile) => Promise<void> | void
  onBusyChange?: (busy: boolean) => void
}) {
  const [extraction, setExtraction] = useState<ExtractedProfile | null>(null),
    [fields, setFields] = useState<string[]>([]),
    [skills, setSkills] = useState(true),
    [roles, setRoles] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [done, setDone] = useState(false),
    [filename, setFilename] = useState('')
  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])
  const extract = async (id: string) => {
    const result = await api<ExtractedProfile>(`/resumes/${id}/extract`)
    setExtraction(result)
    setFields(result.fields.map((f) => f.key))
    setDone(false)
  }
  useEffect(() => {
    if (resumeId) void extract(resumeId).catch((e) => setError(e.message))
  }, [resumeId])
  const upload = async (file: File) => {
    setBusy(true)
    setError('')
    try {
      if (file.size > 5 * 1024 * 1024)
        throw Error('Choose a PDF, DOCX or TXT file smaller than 5MB.')
      const data = new FormData()
      data.append('file', file)
      const result = await api<{ resume: Resume }>('/resumes/upload', 'POST', data)
      setFilename(result.resume.filename)
      await extract(result.resume.id)
      await onUploaded?.(result.resume)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="jh-intake">
      <div className="jh-upload">
        <Upload size={25} />
        <div>
          <strong>{filename || 'Start with your resume'}</strong>
          <p>PDF, DOCX or TXT · up to 5MB. We’ll extract details for you to review.</p>
        </div>
        <label className="ws-button">
          {busy ? <LoaderCircle className="ws-spin" size={16} /> : <FileText size={16} />} Choose
          file
          <input
            type="file"
            aria-label="Upload your resume"
            accept=".pdf,.docx,.txt"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void upload(file)
            }}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="ws-error">
          {error}
        </p>
      )}
      {extraction && (
        <section className="jh-extracted">
          <h3>Review extracted details</h3>
          <p className="ws-muted">
            Nothing changes until you accept. Your sign-in email stays the same.
          </p>
          {extraction.fields.map((field) => (
            <label className="jh-extracted-field" key={field.key}>
              <input
                type="checkbox"
                disabled={busy}
                checked={fields.includes(field.key)}
                onChange={(e) =>
                  setFields((old) =>
                    e.target.checked ? [...old, field.key] : old.filter((k) => k !== field.key),
                  )
                }
              />
              <span>
                <small>{field.key}</small>
                <strong>{field.value}</strong>
                <details>
                  <summary>Source evidence</summary>
                  <p>{field.evidence}</p>
                </details>
              </span>
            </label>
          ))}
          {!!extraction.skills.length && (
            <label className="jh-extracted-field">
              <input
                type="checkbox"
                checked={skills}
                disabled={busy}
                onChange={(e) => setSkills(e.target.checked)}
              />
              <span>
                <strong>Add recognised skills</strong>
                <p>{extraction.skills.join(' · ')}</p>
              </span>
            </label>
          )}
          {!!extraction.suggestedRoles.length && (
            <label className="jh-extracted-field">
              <input
                type="checkbox"
                checked={roles}
                disabled={busy}
                onChange={(e) => setRoles(e.target.checked)}
              />
              <span>
                <strong>Use these as roles to explore</strong>
                <p>{extraction.suggestedRoles.join(' · ')}</p>
              </span>
            </label>
          )}
          <button
            className="ws-button ws-primary"
            disabled={busy || done}
            onClick={() => {
              setBusy(true)
              setError('')
              void api<{ profile: Profile }>(
                `/resumes/${extraction.resumeId}/apply-profile`,
                'POST',
                { fields, includeSkills: skills, includeRoles: roles },
              )
                .then(async (result) => {
                  await onApplied?.(result.profile)
                  setDone(true)
                })
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false))
            }}
          >
            {done ? <Check size={16} /> : null}
            {done ? 'Selected details saved' : 'Use selected details'}
          </button>
          <p className="ws-muted">{extraction.notice}</p>
        </section>
      )}
    </div>
  )
}
