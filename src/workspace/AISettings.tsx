import type { Settings } from '../../shared/types'
export function AIAdminControls({
  settings,
  onChange,
}: {
  settings: Settings
  onChange: (settings: Settings) => void
}) {
  const provider = settings.aiProvider || 'ollama'
  return (
    <div className="ws-ai-settings" role="group" aria-label="AI provider settings">
      <p className="ws-eyebrow">AI PROVIDER</p>
      <label className="ws-field">
        <span>Model provider</span>
        <select
          value={provider}
          onChange={(event) =>
            onChange({
              ...settings,
              aiProvider: event.target.value as 'ollama' | 'gemini',
              aiModel: '',
            })
          }
        >
          <option value="ollama">Ollama — local model</option>
          <option value="gemini">Gemini — hosted model</option>
        </select>
        <small>
          {provider === 'ollama'
            ? 'Resume text is processed by your configured local Ollama server. A model must be installed and running.'
            : 'Hosted inference sends user-provided content to Gemini after consent. Provider usage may be billed to the installation owner.'}
        </small>
      </label>
      <label className="ws-field">
        <span>AI model name</span>
        <input
          value={settings.aiModel || (provider === 'ollama' ? settings.ollamaModel : '')}
          maxLength={120}
          placeholder={
            provider === 'ollama'
              ? 'Enter an installed model name'
              : 'Enter the configured Gemini model name'
          }
          onChange={(event) => onChange({ ...settings, aiModel: event.target.value })}
        />
        <small>
          Use a model available to this provider. Model availability is checked by the server.
        </small>
      </label>
      <label className="ws-field">
        <span>Daily AI requests per account</span>
        <input
          type="number"
          min={1}
          max={1000}
          step={1}
          value={settings.aiDailyLimit ?? 20}
          onChange={(event) => {
            const value = event.target.valueAsNumber
            if (Number.isInteger(value) && value >= 1 && value <= 1000)
              onChange({ ...settings, aiDailyLimit: value })
          }}
        />
        <small>The server enforces this limit. Requests beyond it are rejected.</small>
      </label>
      <p className="ws-hint">
        {provider === 'gemini'
          ? 'Gemini requires ENABLE_HOSTED_AI=true and AI_GEMINI_API_KEY in the server environment. Credentials are never entered or returned here. Choosing Gemini does not configure credentials or enable paid usage.'
          : 'Local inference requires no hosted API key. Configure the Ollama server address in the server environment.'}
      </p>
    </div>
  )
}
