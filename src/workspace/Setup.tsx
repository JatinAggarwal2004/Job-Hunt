import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, FileText, LoaderCircle, Search, X } from 'lucide-react'
import type { Bootstrap, Resume } from '../../shared/types'
import type { SetupDraft, SetupState } from '../../shared/onboarding'
import { roleOptions, locationOptions, experienceOptions } from '../../shared/profile-options'
import { MultiChoice } from './ProfileControls'
import { api } from './api'

const steps = ['Your roles', 'Where & experience', 'Resume (optional)']
export function QuickSetup({
  boot,
  onExit,
  onComplete,
}: {
  boot: Bootstrap
  onExit: () => Promise<void>
  onComplete: (search: boolean) => Promise<void>
}) {
  const [draft, setDraft] = useState<SetupState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [resume, setResume] = useState<Resume | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    void api<SetupState>('/onboarding')
      .then(async (state) => {
        setDraft(state)
        if (state.resumeId) {
          const files = await api<{ resumes: Resume[] }>('/resumes')
          const selected = files.resumes.find((r) => r.id === state.resumeId) || null
          setResume(selected)
          if (!selected) setDraft((old) => (old ? { ...old, resumeId: null } : old))
        }
      })
      .catch((e) => setError(e.message))
  }, [])
  useEffect(() => {
    heading.current?.focus()
  }, [draft?.step])
  const work = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const save = async (value: SetupState) => {
    const { step, roles, locations, experienceLevels, remoteOnly, resumeId } = value
    const state = await api<SetupState>('/onboarding', 'PUT', {
      step,
      roles,
      locations,
      experienceLevels,
      remoteOnly,
      resumeId,
    } satisfies SetupDraft)
    setDraft(state)
  }
  const update = (value: Partial<SetupDraft>) =>
    setDraft((old) => (old ? { ...old, ...value } : old))
  const finish = (search: boolean) =>
    void work(async () => {
      if (!draft) return
      await save(draft)
      await api('/onboarding/complete', 'POST')
      await onComplete(search)
    })
  if (!draft)
    return (
      <section className="ws-panel" role="status">
        {error || 'Opening your saved setup…'}
      </section>
    )
  const canContinue = draft.step === 0 ? draft.roles.length > 0 : draft.locations.length > 0
  return (
    <section className="ws-setup" aria-busy={busy}>
      <div className="ws-setup-top">
        <span className="ws-eyebrow">A SEARCH THAT FEELS LIKE YOU</span>
        <button
          className="ws-text-button"
          disabled={busy}
          onClick={() =>
            void work(async () => {
              await save(draft)
              await api('/onboarding/dismiss', 'POST')
              await onExit()
            })
          }
        >
          I’ll explore on my own <ArrowRight size={15} />
        </button>
      </div>
      <ol className="ws-setup-steps" aria-label="Setup progress">
        {steps.map((label, index) => (
          <li key={label} aria-current={draft.step === index ? 'step' : undefined}>
            <span>{index < draft.step ? <Check size={15} /> : index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <div className="ws-panel ws-setup-card">
        <p className="ws-eyebrow">STEP {draft.step + 1} OF 3</p>
        <h1 ref={heading} tabIndex={-1}>
          {
            [
              'What would you love to do?',
              'Where should we look?',
              'Bring your story. Or start exploring.',
            ][draft.step]
          }
        </h1>
        <p className="ws-muted">
          {
            [
              'Choose a few roles. You can be interested in more than one direction.',
              'Pick several locations and career stages, or leave experience open to explore more.',
              'A resume is optional. Upload it now for Resume studio, or add one whenever you’re ready.',
            ][draft.step]
          }
        </p>
        <fieldset disabled={busy} className="ws-setup-fields">
          {draft.step === 0 && (
            <MultiChoice
              label="Roles you’re interested in"
              hint="Pick examples or type your own role. We search across your chosen roles."
              values={draft.roles}
              options={roleOptions}
              onChange={(roles) => update({ roles })}
              placeholder="Search roles, e.g. Software Engineer"
              suggestionLabel="Popular roles · choose any that interest you"
              suggestions={roleOptions.slice(0, 6)}
            />
          )}
          {draft.step === 1 && (
            <>
              <MultiChoice
                label="Preferred locations"
                hint="Select countries or cities. India includes roles across India. Remote roles may still have country restrictions."
                values={draft.locations}
                options={locationOptions}
                onChange={(locations) => update({ locations })}
                placeholder="Search a city or country"
                suggestionLabel="Quick picks · select all the places you’d consider"
                suggestions={['India', 'Bengaluru', 'Hyderabad', 'Delhi NCR', 'Worldwide']}
              />
              <MultiChoice
                label="Experience levels"
                hint="Choose all stages you’d consider. Leave empty for any level. Unknown requirements stay visible for your review."
                values={draft.experienceLevels}
                options={experienceOptions}
                onChange={(experienceLevels) => update({ experienceLevels })}
                placeholder="Choose one or more levels"
                allowCustom={false}
                suggestionLabel="Career stages · choose one, several or leave open"
                suggestions={experienceOptions}
              />
              <label className="ws-check">
                <input
                  type="checkbox"
                  checked={draft.remoteOnly}
                  onChange={(e) => update({ remoteOnly: e.target.checked })}
                />{' '}
                Remote roles only
              </label>
            </>
          )}
          {draft.step === 2 && (
            <>
              <div className="ws-setup-upload">
                <FileText size={28} />
                <div>
                  <strong>{resume?.filename || 'Your resume, ready when you are'}</strong>
                  <p className="ws-muted">
                    PDF, DOCX or TXT · up to 5 MB. Stored in your account; nothing is sent to an AI
                    model here.
                  </p>
                </div>
                <label className="ws-button">
                  {resume ? 'Choose another file' : 'Choose resume'}
                  <input
                    aria-label="Upload optional resume"
                    type="file"
                    accept=".pdf,.docx,.txt"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (!file) return
                      void work(async () => {
                        if (file.size > 5 * 1024 * 1024)
                          throw new Error('Choose a file smaller than 5 MB.')
                        const data = new FormData()
                        data.append('file', file)
                        const result = await api<{ resume: Resume }>(
                          '/resumes/upload',
                          'POST',
                          data,
                        )
                        setResume(result.resume)
                        await save({ ...draft, resumeId: result.resume.id })
                      })
                    }}
                  />
                </label>
                {draft.resumeId && (
                  <button
                    className="ws-text-button"
                    onClick={() => {
                      update({ resumeId: null })
                      setResume(null)
                    }}
                  >
                    <X size={15} /> Continue without this resume
                  </button>
                )}
              </div>
              <div className="ws-setup-summary">
                <strong>Your search at a glance</strong>
                <p>{draft.roles.join(' · ')}</p>
                <p>
                  {draft.locations.join(' · ')}
                  {draft.remoteOnly ? ' · Remote only' : ''}
                </p>
                <p>{draft.experienceLevels.join(' · ') || 'Any experience level'}</p>
              </div>
              <p className="ws-muted">
                {boot.entitlements.access === 'free'
                  ? `You have ${boot.entitlements.freeRunsRemaining} of 5 free lifetime scans left. A successful discovery uses one; a failed scan returns it.`
                  : 'Your membership includes discovery scans.'}{' '}
                Coverage depends on available sources; results may take a moment.
              </p>
            </>
          )}
        </fieldset>
        {error && (
          <p className="ws-banner ws-error" role="alert">
            {error}
          </p>
        )}
        <div className="ws-setup-actions">
          <button
            className="ws-button"
            disabled={busy || draft.step === 0}
            onClick={() => void work(() => save({ ...draft, step: draft.step - 1 }))}
          >
            <ArrowLeft size={16} /> Back
          </button>
          {draft.step < 2 ? (
            <button
              className="ws-button ws-primary"
              disabled={busy || !canContinue}
              onClick={() => void work(() => save({ ...draft, step: draft.step + 1 }))}
            >
              Continue <ArrowRight size={16} />
            </button>
          ) : (
            <>
              <button className="ws-text-button" disabled={busy} onClick={() => finish(false)}>
                Save setup for later
              </button>
              <button className="ws-button ws-primary" disabled={busy} onClick={() => finish(true)}>
                {busy ? <LoaderCircle className="ws-spin" size={17} /> : <Search size={17} />} Find
                my matches
              </button>
            </>
          )}
        </div>
        <p className="ws-setup-footnote">
          Progress saves with Continue, Back, or “I’ll explore on my own”. Salary, skills, company
          size and schedules can be refined in Search & profile.
        </p>
      </div>
    </section>
  )
}
