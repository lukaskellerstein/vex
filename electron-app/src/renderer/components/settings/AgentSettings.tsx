import { useState, useEffect } from 'react'
import { Eye, EyeOff, ChevronDown, CheckCircle2, AlertCircle } from 'lucide-react'

interface FieldRowProps {
  label: string
  description: string
  children: React.ReactNode
}

function FieldRow({ label, description, children }: FieldRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: '40px',
        padding: '8px 0',
        borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)',
      }}
    >
      <div style={{ maxWidth: '55%' }}>
        <div style={{ color: 'var(--foreground)', fontSize: '13px', fontWeight: 500 }}>
          {label}
        </div>
        <div style={{ color: 'var(--foreground-dim)', fontSize: '12px', lineHeight: '1.5', marginTop: '2px' }}>
          {description}
        </div>
      </div>
      <div style={{ minWidth: '200px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        {children}
      </div>
    </div>
  )
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: '36px',
        height: '20px',
        borderRadius: '9999px',
        background: checked ? 'var(--primary)' : 'var(--border)',
        transition: 'background 150ms ease-out',
        cursor: 'pointer',
        border: 'none',
        padding: 0,
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          width: '16px',
          height: '16px',
          borderRadius: '9999px',
          background: 'var(--foreground)',
          left: checked ? '18px' : '2px',
          top: '2px',
          transition: 'left 200ms ease-in-out',
        }}
      />
    </button>
  )
}

const inputStyle: React.CSSProperties = {
  height: '32px',
  background: 'var(--surface-elevated)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  padding: '0 10px',
  fontFamily: 'var(--font-ui)',
  fontSize: '13px',
  color: 'var(--foreground)',
  outline: 'none',
}

function handleInputFocus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = 'var(--primary)'
  e.currentTarget.style.boxShadow = '0 0 0 2px hsla(263, 82%, 57.5%, 0.6)'
}

function handleInputBlur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = 'var(--border)'
  e.currentTarget.style.boxShadow = 'none'
}

export function AgentSettings() {
  const [defaultType, setDefaultType] = useState('coding')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [apiKeyValid, setApiKeyValid] = useState<boolean | null>(null)
  const [maxAgents, setMaxAgents] = useState(5)
  const [autoRestart, setAutoRestart] = useState(true)
  const [restartDelay, setRestartDelay] = useState(5)
  const [heartbeatTimeout, setHeartbeatTimeout] = useState(30)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.electronAPI.getConfig().then((data: Record<string, unknown>) => {
      if (!data) return
      if (typeof data.default_agent_type === 'string') setDefaultType(data.default_agent_type)
      if (typeof data.anthropic_api_key === 'string') {
        setApiKey(data.anthropic_api_key)
        setApiKeyValid(data.anthropic_api_key.startsWith('sk-ant-'))
      }
      if (typeof data.max_concurrent_agents === 'number') setMaxAgents(data.max_concurrent_agents)
      if (typeof data.auto_restart_on_error === 'boolean') setAutoRestart(data.auto_restart_on_error)
      if (typeof data.restart_delay === 'number') setRestartDelay(data.restart_delay)
      if (typeof data.heartbeat_timeout === 'number') setHeartbeatTimeout(data.heartbeat_timeout)
    })
  }, [])

  function handleApiKeyChange(value: string) {
    setApiKey(value)
    setApiKeyValid(value.length > 0 ? value.startsWith('sk-ant-') : null)
  }

  async function handleSave() {
    await window.electronAPI.updateConfig({
      default_agent_type: defaultType,
      anthropic_api_key: apiKey,
      max_concurrent_agents: maxAgents,
      auto_restart_on_error: autoRestart,
      restart_delay: restartDelay,
      heartbeat_timeout: heartbeatTimeout,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <div
        style={{
          borderBottom: '1px solid var(--border)',
          paddingBottom: '12px',
          marginBottom: '24px',
          fontSize: '18px',
          fontWeight: 700,
          color: 'var(--foreground)',
          letterSpacing: '-0.02em',
        }}
      >
        Agent Configuration
      </div>

      <FieldRow label="Default agent type" description="The agent type assigned to new agents when not specified.">
        <div style={{ position: 'relative' }}>
          <select
            value={defaultType}
            onChange={(e) => setDefaultType(e.target.value)}
            style={{
              ...inputStyle,
              minWidth: '160px',
              cursor: 'pointer',
              appearance: 'none',
              paddingRight: '28px',
            }}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
          >
            <option value="coding">coding</option>
            <option value="design">design</option>
            <option value="review">review</option>
            <option value="debug">debug</option>
            <option value="test">test</option>
          </select>
          <ChevronDown
            size={12}
            style={{
              position: 'absolute',
              right: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--foreground-dim)',
              pointerEvents: 'none',
            }}
          />
        </div>
      </FieldRow>

      {/* API Key -- custom layout for validation indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          minHeight: '40px',
          padding: '8px 0',
          borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)',
        }}
      >
        <div style={{ maxWidth: '55%' }}>
          <div style={{ color: 'var(--foreground)', fontSize: '13px', fontWeight: 500 }}>
            Anthropic API key
          </div>
          <div style={{ color: 'var(--foreground-dim)', fontSize: '12px', lineHeight: '1.5', marginTop: '2px' }}>
            Your API key for Claude model access. Stored locally in the config file.
          </div>
        </div>
        <div style={{ minWidth: '200px', display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                style={{ ...inputStyle, width: '280px' }}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
              <button
                onClick={() => setShowKey(!showKey)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--foreground-dim)',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--foreground-muted)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--foreground-dim)' }}
              >
                {showKey ? <EyeOff size={14} strokeWidth={1.5} /> : <Eye size={14} strokeWidth={1.5} />}
              </button>
            </div>
            {apiKeyValid !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                {apiKeyValid ? (
                  <>
                    <CheckCircle2 size={12} style={{ color: 'var(--status-success)' }} />
                    <span style={{ fontSize: '11px', color: 'var(--status-success)' }}>Key format valid</span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={12} style={{ color: 'var(--status-error)' }} />
                    <span style={{ fontSize: '11px', color: 'var(--status-error)' }}>Invalid key format</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <FieldRow label="Max concurrent agents" description="Maximum number of agents that can run simultaneously.">
        <input
          type="number"
          min={1}
          max={20}
          value={maxAgents}
          onChange={(e) => setMaxAgents(Number(e.target.value))}
          style={{ ...inputStyle, width: '80px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
        />
      </FieldRow>

      <FieldRow label="Auto-restart on error" description="Automatically restart an agent if it encounters a fatal error.">
        <ToggleSwitch checked={autoRestart} onChange={setAutoRestart} />
      </FieldRow>

      <FieldRow label="Restart delay" description="Wait time in seconds before automatically restarting a failed agent.">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="number"
            value={restartDelay}
            onChange={(e) => setRestartDelay(Number(e.target.value))}
            style={{ ...inputStyle, width: '80px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
          />
          <span style={{ color: 'var(--foreground-dim)', fontSize: '12px' }}>seconds</span>
        </div>
      </FieldRow>

      <FieldRow label="Heartbeat timeout" description="Mark an agent as offline after this many seconds without a heartbeat.">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="number"
            value={heartbeatTimeout}
            onChange={(e) => setHeartbeatTimeout(Number(e.target.value))}
            style={{ ...inputStyle, width: '80px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
          />
          <span style={{ color: 'var(--foreground-dim)', fontSize: '12px' }}>seconds</span>
        </div>
      </FieldRow>

      <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={handleSave}
          style={{
            height: '32px',
            padding: '0 16px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--primary-foreground)',
            background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-active) 100%)',
            border: 'none',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 0 16px hsla(263, 82%, 57.5%, 0.4)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          {saved ? 'Saved!' : 'Save Agent Defaults'}
        </button>
      </div>
    </div>
  )
}
