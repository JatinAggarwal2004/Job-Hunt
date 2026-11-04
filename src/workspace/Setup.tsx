import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, LoaderCircle, Search } from 'lucide-react'
import type { Bootstrap, Resume } from '../../shared/types'
import type { SetupDraft, SetupState } from '../../shared/onboarding'
import { roleOptions, locationOptions, experienceOptions } from '../../shared/profile-options'
import { MultiChoice } from './ProfileControls'
import { ResumeIntake } from './ResumeIntake'
import { api } from './api'
const steps = ['Your resume', 'Your direction', 'Places & experience']
export function QuickSetup({
  boot,
  onExit,
  onComplete,
}: {
  boot: Bootstrap
  onExit: () => Promise<void>
  onComplete: (search: boolean) => Promise<void>
}) {
  const [draft, setDraft] = useState<SetupState | null>(null),
    [busy, setBusy] = useState(false),
    [intakeBusy, setIntakeBusy] = useState(false),
    [error, setError] = useState(''),
    [resume, setResume] = useState<Resume | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    void api<SetupState>('/onboarding')
      .then(setDraft)
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
    const result = await api<SetupState>('/onboarding', 'PUT', {
      step,
      roles,
      locations,
      experienceLevels,
      remoteOnly,
      resumeId,
    } satisfies SetupDraft)
    setDraft(result)
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
  const canContinue =
    draft.step === 0 ||
    (draft.step === 1 && draft.roles.length > 0) ||
    (draft.step === 2 && draft.locations.length > 0)
  return (
    <section className="ws-setup jh-resume-first" aria-busy={busy}>
      <div className="ws-setup-top">
        <span>Make this search yours</span>
        <button
          className="ws-text-button"
          disabled={busy || intakeBusy}
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
        {steps.map((label, i) => (
          <li key={label} aria-current={draft.step === i ? 'step' : undefined}>
            <span>{i < draft.step ? <Check size={15} /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <div className="ws-panel ws-setup-card">
        <p className="ws-muted">Step {draft.step + 1} of 3</p>
        <h1 ref={heading} tabIndex={-1}>
          {
            ['Start with your story.', 'What work interests you?', 'Where should we look?'][
              draft.step
            ]
          }
        </h1>
        <p className="ws-muted">
          {
            [
              'Upload a resume, review what we find and save only the details you accept. You can also skip this step.',
              'Choose all the roles you want to explore. Suggestions are a starting point, not assumptions about you.',
              'Choose locations and experience levels you’d consider. Your next scan uses this direction.',
            ][draft.step]
          }
        </p>
        <div className="ws-setup-fields">
          {draft.step === 0 && (
            <>
              <ResumeIntake
                onBusyChange={setIntakeBusy}
                resumeId={draft.resumeId}
                onUploaded={async (r) => {
                  setResume(r)
                  await save({ ...draft, resumeId: r.id })
                }}
                onApplied={async (profile) => {
                  update({ roles: profile.roles })
                }}
              />
              {draft.resumeId && (
                <button
                  className="ws-text-button"
                  disabled={busy || intakeBusy}
                  onClick={() => {
                    setResume(null)
                    void work(() => save({ ...draft, resumeId: null }))
                  }}
                >
                  Continue without this resume
                </button>
              )}
            </>
          )}
          {draft.step === 1 && (
            <MultiChoice
              label="Roles you’re interested in"
              hint="Select several roles or enter your own. We use these roles when searching employer sites."
              values={draft.roles}
              options={roleOptions}
              onChange={(roles) => update({ roles })}
              placeholder="Search roles, e.g. Backend Engineer"
              suggestionLabel="Popular directions"
              suggestions={roleOptions.slice(0, 8)}
            />
          )}
          {draft.step === 2 && (
            <>
              <MultiChoice
                label="Preferred locations"
                hint="Select cities or countries. Remote jobs may still restrict where you can work."
                values={draft.locations}
                options={locationOptions}
                onChange={(locations) => update({ locations })}
                placeholder="Search a city or country"
                suggestionLabel="Quick picks"
                suggestions={['India', 'Bengaluru', 'Hyderabad', 'Delhi NCR', 'Worldwide']}
              />
              <MultiChoice
                label="Experience levels"
                hint="Choose several levels or leave open. Unknown requirements stay visible for your review."
                values={draft.experienceLevels}
                options={experienceOptions}
                onChange={(experienceLevels) => update({ experienceLevels })}
                allowCustom={false}
                suggestions={experienceOptions}
                suggestionLabel="Choose the stages you’d consider"
              />
              <label className="ws-check">
                <input
                  type="checkbox"
                  checked={draft.remoteOnly}
                  onChange={(e) => update({ remoteOnly: e.target.checked })}
                />{' '}
                Remote roles only
              </label>
              <div className="ws-setup-summary">
                <strong>Your search, ready to go</strong>
                <p>{draft.roles.join(' · ')}</p>
                <p>{draft.locations.join(' · ')}</p>
                <p>{draft.experienceLevels.join(' · ') || 'Any experience level'}</p>
                <p>
                  {resume?.filename ||
                    (draft.resumeId ? 'Resume uploaded' : 'Resume can be added later')}
                </p>
              </div>
              <p className="ws-muted">
                {boot.entitlements.access === 'free'
                  ? `${boot.entitlements.freeRunsRemaining} of 5 lifetime free scans remain. A successful scan uses one; a failed scan returns it.`
                  : 'Your membership includes discovery scans.'}{' '}
                Coverage depends on available sources; matched results are explained in the
                workspace.
              </p>
            </>
          )}
        </div>
        {error && (
          <p className="ws-error" role="alert">
            {error}
          </p>
        )}
        <div className="ws-setup-actions">
          <button
            className="ws-button"
            disabled={busy || intakeBusy || draft.step === 0}
            onClick={() => void work(() => save({ ...draft, step: draft.step - 1 }))}
          >
            <ArrowLeft size={15} /> Back
          </button>
          {draft.step < 2 ? (
            <button
              className="ws-button ws-primary"
              disabled={busy || intakeBusy || !canContinue}
              onClick={() => void work(() => save({ ...draft, step: draft.step + 1 }))}
            >
              {draft.step === 0 && !draft.resumeId ? 'Skip resume for now' : 'Continue'}{' '}
              <ArrowRight size={15} />
            </button>
          ) : (
            <>
              <button
                className="ws-text-button"
                disabled={busy || intakeBusy || !canContinue}
                onClick={() => finish(false)}
              >
                Save for later
              </button>
              <button
                className="ws-button ws-primary"
                disabled={busy || intakeBusy || !canContinue}
                onClick={() => finish(true)}
              >
                {busy ? <LoaderCircle className="ws-spin" size={16} /> : <Search size={16} />}Find
                my matches
              </button>
            </>
          )}
        </div>
        <p className="ws-setup-footnote">
          Choices save with Continue, Back or explicit skip. Accepted resume details save
          separately. Salary, schedules and other refinements are available in Search & profile.
        </p>
      </div>
    </section>
  )
}
