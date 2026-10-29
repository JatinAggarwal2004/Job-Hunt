import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Plus, X } from 'lucide-react'
import { readSaved, saveLocal } from '../hooks/storage'
const roles = ['Frontend Engineer', 'Backend Engineer', 'Product Designer', 'Full-stack Engineer', 'Data Analyst', 'Product Manager']
export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [selected, setSelected] = useState<string[]>(() => { const saved = readSaved<unknown>('jh-interests', []); return Array.isArray(saved) ? saved.filter((v): v is string => typeof v === 'string') : [] })
  const [custom, setCustom] = useState(''), [message, setMessage] = useState('')
  useEffect(() => { if (open) { ref.current?.showModal(); setMessage('') } else ref.current?.close() }, [open])
  function toggle(role: string) { setMessage(''); setSelected(selected.includes(role) ? selected.filter(item => item !== role) : [...selected, role]) }
  function save() {
    const interests = [...new Set([...selected, ...custom.split(',').map(role => role.trim()).filter(Boolean)])]
    if (!interests.length) { setMessage('Choose at least one role, or enter your own role below.'); return }
    setSelected(interests); setCustom('')
    setMessage(saveLocal('jh-interests', interests) ? 'Saved on this device. Scheduled discovery will be available in the next build.' : 'Your browser blocked saving. Allow local storage and try again. Your choices are still here.')
  }
  return <dialog ref={ref} aria-labelledby="search-title" className="search-dialog" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose() } }}>
    <button className="icon-button close-dialog" aria-label="Close search preferences" onClick={onClose}><X size={20} /></button><span className="dialog-symbol"><SearchSymbol /></span><p className="micro-label">Your search starts with you.</p><h2 id="search-title">What’s your next chapter?</h2><p>Choose the roles you’re curious about. There’s room for more than one direction.</p>
    <div className="role-options">{[...new Set([...roles, ...selected])].map(role => <button key={role} aria-pressed={selected.includes(role)} onClick={() => toggle(role)}>{selected.includes(role) ? <Check size={15} /> : <Plus size={15} />}{role}</button>)}</div>
    <label htmlFor="custom-role">Something else in mind?</label><input id="custom-role" value={custom} onChange={e => { setCustom(e.target.value); setMessage('') }} placeholder="e.g. Machine Learning Engineer" maxLength={240} /><small>Separate multiple roles with commas.</small>
    <button className="glossy-button dialog-save" onClick={save}>Save my interests <ArrowRight size={17} /></button><p className="form-message" role="status">{message || 'Local preview · No account or background search is created yet.'}</p>
  </dialog>
}
function SearchSymbol() { return <span aria-hidden="true">↗</span> }
