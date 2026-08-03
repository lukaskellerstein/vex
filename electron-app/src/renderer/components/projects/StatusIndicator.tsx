interface StatusIndicatorProps {
  status: string;
  showLabel?: boolean;
}

const STATUS_CONFIG: Record<string, { color: string; label: string; pulse: boolean }> = {
  running: { color: "var(--status-success)", label: "Running", pulse: true },
  starting: { color: "var(--status-warning)", label: "Starting", pulse: true },
  stopping: { color: "var(--status-warning)", label: "Stopping", pulse: false },
  error: { color: "var(--status-error)", label: "Error", pulse: false },
  idle: { color: "var(--status-idle)", label: "Stopped", pulse: false },
  stopped: { color: "var(--status-idle)", label: "Stopped", pulse: false },
};

export function StatusIndicator({ status, showLabel = true }: StatusIndicatorProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.idle;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <span
        style={{
          position: "relative",
          display: "inline-block",
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: config.color,
          flexShrink: 0,
        }}
      >
        {config.pulse && (
          <span
            style={{
              position: "absolute",
              inset: "-3px",
              borderRadius: "50%",
              background: config.color,
              opacity: 0,
              animation: "status-pulse 2s ease-out infinite",
            }}
          />
        )}
      </span>
      {showLabel && (
        <span style={{ fontSize: "11px", color: "var(--foreground-muted)" }}>{config.label}</span>
      )}
    </span>
  );
}
