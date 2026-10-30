import { useId, useRef, useState } from 'react'
import { ChevronDown, Info, X } from 'lucide-react'
import { uniqueChoices } from '../../shared/profile-options'
export function HelpTip({ label, children }: { label: string; children: string }) {
  const id = useId(),
    [open, setOpen] = useState(false)
  return (
    <span
      className="ws-help"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="ws-help-trigger"
        aria-label={`About ${label}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            setOpen(false)
          }
        }}
      >
        <Info size={16} />
      </button>
      {open && (
        <span id={id} role="tooltip" className="ws-help-tip">
          {children}
        </span>
      )}
    </span>
  )
}
export function MultiChoice({
  label,
  hint,
  values,
  options,
  onChange,
  placeholder = 'Search or add your own',
  suggestions = [],
  allowCustom = true,
}: {
  label: string
  hint: string
  values: string[]
  options: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  suggestions?: string[]
  allowCustom?: boolean
}) {
  const id = useId(),
    [query, setQuery] = useState(''),
    details = useRef<HTMLDetailsElement>(null)
  const choices = uniqueChoices([...options, ...values]).filter((v) =>
    v.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const has = (value: string) => values.some((v) => v.toLowerCase() === value.toLowerCase())
  const toggle = (value: string) =>
    onChange(
      has(value)
        ? values.filter((v) => v.toLowerCase() !== value.toLowerCase())
        : uniqueChoices([...values, value]),
    )
  const add = () => {
    onChange(uniqueChoices([...values, ...query.split(',')]))
    setQuery('')
  }
  return (
    <fieldset className="ws-multifield">
      <legend>
        {label}
        <HelpTip label={label}>{hint}</HelpTip>
      </legend>
      <p id={`${id}-hint`} className="ws-choice-hint">
        {hint}
      </p>
      <div className="ws-selected-choices" aria-label={`Selected ${label}`}>
        {values.map((value) => (
          <button
            type="button"
            className="ws-choice-chip"
            key={value}
            onClick={() => toggle(value)}
            aria-label={`Remove ${value} from ${label}`}
          >
            {value}
            <X size={14} />
          </button>
        ))}
      </div>
      <details
        ref={details}
        className="ws-choice-dropdown"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            details.current!.open = false
            details.current?.querySelector('summary')?.focus()
          }
        }}
      >
        <summary>
          {values.length
            ? `Add or change selections (${values.length})`
            : `Choose ${label.toLowerCase()}`}
          <ChevronDown size={16} />
        </summary>
        <div className="ws-choice-menu">
          <input
            aria-label={label}
            aria-describedby={`${id}-hint`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            maxLength={2000}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (allowCustom && query.trim()) add()
              }
            }}
          />
          <div className="ws-choice-options">
            {choices.map((value) => (
              <label className="ws-check" key={value}>
                <input type="checkbox" checked={has(value)} onChange={() => toggle(value)} />
                {value}
              </label>
            ))}
            {!choices.length && (
              <p>
                {allowCustom
                  ? 'No matching examples. Add your own below.'
                  : 'No matching levels. Try another search.'}
              </p>
            )}
          </div>
          {allowCustom && query.trim() && !has(query.trim()) && (
            <button type="button" className="ws-button" onClick={add}>
              Add “{query.trim().slice(0, 80)}”
            </button>
          )}
          <button
            type="button"
            className="ws-button"
            onClick={() => {
              details.current!.open = false
              details.current?.querySelector('summary')?.focus()
            }}
          >
            Done choosing
          </button>
        </div>
      </details>
      {suggestions.filter((v) => !has(v)).length > 0 && (
        <div className="ws-choice-suggestions">
          <span>Suggested from your roles · choose only what fits you</span>
          <div>
            {suggestions
              .filter((v) => !has(v))
              .map((value) => (
                <button key={value} type="button" onClick={() => toggle(value)}>
                  + {value}
                </button>
              ))}
          </div>
        </div>
      )}
    </fieldset>
  )
}
