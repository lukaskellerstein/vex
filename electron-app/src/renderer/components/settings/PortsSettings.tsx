import { useState, useEffect } from 'react'
import { Network, CheckCircle2, AlertCircle } from 'lucide-react'

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

const numberInputStyle: React.CSSProperties = {
  height: '32px',
  width: '100px',
  background: 'var(--surface-elevated)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  padding: '0 10px',
  fontFamily: 'var(--font-mono)',
  fontSize: '13px',
  color: 'var(--foreground-muted)',
  textAlign: 'center',
  outline: 'none',
}

type PortStatus = 'idle' | 'checking' | 'done'

interface PortResult {
  nats: 'clear' | 'conflict' | null
  ws: 'clear' | 'conflict' | null
  ao: 'clear' | 'conflict' | null
}

export function PortsSettings() {
  const [natsPort, setNatsPort] = useState(4222)
  const [wsPort, setWsPort] = useState(4223)
  const [aoPort, setAoPort] = useState(8420)
  const [checkStatus, setCheckStatus] = useState<PortStatus>('idle')
  const [portResults, setPortResults] = useState<PortResult>({ nats: null, ws: null, ao: null })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.electronAPI.getConfig().then((data: Record<string, unknown>) => {
      if (!data) return
      if (typeof data.nats_port === 'number') setNatsPort(data.nats_port)
      if (typeof data.nats_ws_port === 'number') setWsPort(data.nats_ws_port)
      if (typeof data.agent_manager_port === 'number') setAoPort(data.agent_manager_port)
    })
  }, [])

  async function handleCheckPorts() {
    setCheckStatus('checking')
    const results: PortResult = { nats: null, ws: null, ao: null }

    try {
      const natsStatus = await window.electronAPI.getNatsStatus()
      results.nats = natsStatus?.healthy ? 'clear' : 'conflict'
    } catch {
      results.nats = 'conflict'
    }

    // WebSocket -- no direct check, assume clear if NATS is healthy
    results.ws = results.nats === 'clear' ? 'clear' : 'conflict'

    try {
      const resp = await fetch(`http://localhost:${aoPort}/api/health`)
      results.ao = resp.ok ? 'clear' : 'conflict'
    } catch {
      results.ao = 'conflict'
    }

    setPortResults(results)
    setCheckStatus('done')
  }

  async function handleSave() {
    await window.electronAPI.updateConfig({
      nats_port: natsPort,
      nats_ws_port: wsPort,
      agent_manager_port: aoPort,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleInputFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = 'var(--primary)'
    e.currentTarget.style.boxShadow = '0 0 0 2px hsla(263, 82%, 57.5%, 0.6)'
  }

  function handleInputBlur(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = 'var(--border)'
    e.currentTarget.style.boxShadow = 'none'
  }

  return (
    <div>
      <div
        style={{
          borderBottom: '1px solid var(--border)',
          paddingBottom: '12px',
          marginBottom: '12px',
          fontSize: '18px',
          fontWeight: 700,
          color: 'var(--foreground)',
          letterSpacing: '-0.02em',
        }}
      >
        Ports &amp; Networking
      </div>

      <p style={{ color: 'var(--foreground-dim)', fontSize: '13px', lineHeight: '1.6', marginBottom: '20px' }}>
        Configure the network ports Vex uses for internal service communication. Changes require a restart.
      </p>

      <FieldRow label="NATS port" description="Port for the NATS message bus used by agents and the event system.">
        <input
          type="number"
          value={natsPort}
          onChange={(e) => setNatsPort(Number(e.target.value))}
          style={numberInputStyle}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
        />
      </FieldRow>

      <FieldRow label="WebSocket port" description="Port for the WebSocket server used by the browser extension.">
        <input
          type="number"
          value={wsPort}
          onChange={(e) => setWsPort(Number(e.target.value))}
          style={numberInputStyle}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
        />
      </FieldRow>

      <FieldRow label="Agent Manager port" description="Port for the internal Agent Manager HTTP API.">
        <input
          type="number"
          value={aoPort}
          onChange={(e) => setAoPort(Number(e.target.value))}
          style={numberInputStyle}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
        />
      </FieldRow>

      {/* Check Ports */}
      <div style={{ marginTop: '16px' }}>
        <button
          onClick={handleCheckPorts}
          style={{
            height: '32px',
            padding: '0 14px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--foreground-muted)',
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'border-color 150ms ease-out, color 150ms ease-out',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-bright)'
            e.currentTarget.style.color = 'var(--foreground)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--foreground-muted)'
          }}
        >
          <Network size={14} strokeWidth={1.5} />
          {checkStatus === 'checking' ? 'Checking...' : 'Check Ports Now'}
        </button>

        {checkStatus === 'done' && (
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {[
              { label: `NATS (${natsPort})`, status: portResults.nats },
              { label: `WebSocket (${wsPort})`, status: portResults.ws },
              { label: `Agent Manager (${aoPort})`, status: portResults.ao },
            ].map(({ label, status }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                {status === 'clear' ? (
                  <CheckCircle2 size={12} style={{ color: 'var(--status-success)' }} />
                ) : (
                  <AlertCircle size={12} style={{ color: 'var(--status-error)' }} />
                )}
                <span style={{ color: status === 'clear' ? 'var(--status-success)' : 'var(--status-error)' }}>
                  {label} -- {status === 'clear' ? 'Available' : 'In use / unreachable'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

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
          {saved ? 'Saved!' : 'Save & Restart Required'}
        </button>
      </div>
    </div>
  )
}
