import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Bookmark, Check, CheckCheck, FileText, MapPin, Search, SlidersHorizontal, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { GlassCard, TiltCard } from './Primitives'

const examples = [
  { name: 'Frontend Engineer', company: 'An early-stage product team', location: 'Remote', type: 'Full-time', mark: '↗', color: 'yellow' },
  { name: 'Product Designer', company: 'An independent design studio', location: 'Hybrid', type: 'Full-time', mark: '✳', color: 'lilac' },
]
function DiscoverPanel() {
  const [saved, setSaved] = useState<string[]>([])
  return <><div className="preview-heading"><div><span className="micro-label">A little more you.</span><h2>Possibilities, curated.</h2></div><SlidersHorizontal size={18} /></div>
    <div className="search-field"><Search size={16} /><span>Roles that fit your next chapter</span></div>
    <div className="preview-filters"><span>All interests</span><span>Any company size</span><span>Remote + hybrid</span></div>
    <div className="job-list">{examples.map(job => <article className="job-row" key={job.name}><span className={`company-mark ${job.color}`} aria-hidden="true">{job.mark}</span><div className="job-copy"><h3>{job.name}</h3><p>{job.company}</p><div><span><MapPin size={11} />{job.location}</span><span>{job.type}</span></div></div><button className={`save-button ${saved.includes(job.name) ? 'saved' : ''}`} aria-label={`${saved.includes(job.name) ? 'Unsave' : 'Save'} sample ${job.name}`} aria-pressed={saved.includes(job.name)} onClick={() => setSaved(saved.includes(job.name) ? saved.filter(name => name !== job.name) : [...saved, job.name])}><Bookmark size={17} fill={saved.includes(job.name) ? 'currentColor' : 'none'} /></button></article>)}</div>
    <div className="preview-bottom"><span><span className="status-dot" />Small teams. Big possibilities.</span><span aria-live="polite">{saved.length ? `${saved.length} saved in demo` : 'Illustrative openings'}</span></div></>
}
function ResumePanel() {
  const [accepted, setAccepted] = useState(false)
  return <><div className="preview-heading"><div><span className="micro-label">Your experience, clearer.</span><h2>Make the story stronger.</h2></div><FileText size={20} /></div><div className="resume-example"><span className="document-label">EXAMPLE EXPERIENCE</span><p>{accepted ? 'Built a reusable component library that helped the team ship consistent interfaces.' : 'Worked on frontend components and helped the team.'}</p></div><div className="suggestion"><Sparkles size={18} /><div><strong>Be specific about your contribution.</strong><p>Name what you built and its impact. Add numbers only when you can support them.</p></div></div><button className="preview-action" onClick={() => setAccepted(!accepted)}>{accepted ? <><Check size={16} />Suggestion accepted · Undo</> : <>Try this suggestion <ArrowRight size={16} /></>}</button><p className="panel-footnote">Example feedback. Your resume stays yours to edit.</p></>
}
function ApplyPanel() {
  return <><div className="preview-heading"><div><span className="micro-label">Less repetition. More intention.</span><h2>You make the final call.</h2></div><CheckCheck size={22} /></div><ol className="apply-steps"><li><span>1</span><div><strong>Find an opening you like</strong><p>Check the source, role and requirements.</p></div><Check size={16} /></li><li><span>2</span><div><strong>Prepare your application</strong><p>Reuse your profile on supported forms.</p></div><Check size={16} /></li><li><span>3</span><div><strong>Review, then apply</strong><p>Confirm your answers before submitting.</p></div><ArrowUpRightIcon /></li></ol><p className="panel-footnote">Workflow preview · No application will be submitted.</p></>
}
function ArrowUpRightIcon() { return <ArrowRight size={16} className="diagonal-arrow" /> }
export function WorkflowPreview({ active, setActive }: { active: number; setActive: (tab: number) => void }) {
  const reduced = useReducedMotion()
  const labels = ['Discover', 'Refine', 'Prepare']
  function onKey(event: React.KeyboardEvent, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : -1
    if (next < 0) return
    event.preventDefault(); setActive(next); document.getElementById(`workflow-tab-${next}`)?.focus()
  }
  return <div className="preview-scene" id="preview"><div className="orbit orbit-one" aria-hidden="true" /><div className="orbit orbit-two" aria-hidden="true" /><div className="orbit-star" aria-hidden="true">✳</div>
    <div className="floating-note"><span className="note-icon"><Sparkles size={16} /></span><div>A search that gets you.<small>Built around your interests.</small></div></div>
    <TiltCard><GlassCard className="workspace-preview"><div className="preview-topline"><span><span className="mini-brand">jh</span> Your next chapter</span><span className="sample-badge">Interactive preview</span></div>
      <div role="tablist" aria-label="Explore the workflow" className="preview-tabs">{labels.map((label, i) => <button key={label} id={`workflow-tab-${i}`} role="tab" aria-selected={active === i} aria-controls="workflow-panel" tabIndex={active === i ? 0 : -1} onClick={() => setActive(i)} onKeyDown={e => onKey(e, i)}>{active === i && <motion.span className="tab-indicator" layoutId="active-tab" transition={{ duration: reduced ? 0 : 0.22 }} />}<span className="tab-label"><span>0{i + 1}</span>{label}</span></button>)}</div>
      <div id="workflow-panel" role="tabpanel" aria-labelledby={`workflow-tab-${active}`} tabIndex={0} className="workflow-panel"><AnimatePresence mode="wait"><motion.div key={active} initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.18 }}>{active === 0 ? <DiscoverPanel /> : active === 1 ? <ResumePanel /> : <ApplyPanel />}</motion.div></AnimatePresence></div>
    </GlassCard></TiltCard><div className="scene-caption"><span className="caption-line" />A little less searching. A little more possibility.</div></div>
}
