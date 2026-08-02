import { useEffect, useState } from "react";

type Theme = "dark" | "light";

interface FieldRowProps {
  label: string;
  description: string;
  children: React.ReactNode;
}

function FieldRow({ label, description, children }: FieldRowProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        minHeight: "40px",
        padding: "8px 0",
        borderBottom: "1px solid color-mix(in srgb, var(--border) 50%, transparent)",
      }}
    >
      <div style={{ maxWidth: "55%" }}>
        <div style={{ color: "var(--foreground)", fontSize: "13px", fontWeight: 500 }}>{label}</div>
        <div
          style={{
            color: "var(--foreground-dim)",
            fontSize: "12px",
            lineHeight: "1.5",
            marginTop: "2px",
          }}
        >
          {description}
        </div>
      </div>
      <div
        style={{
          minWidth: "200px",
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: "36px",
        height: "20px",
        borderRadius: "9999px",
        background: checked ? "var(--primary)" : "var(--border)",
        transition: "background 150ms ease-out",
        cursor: "pointer",
        border: "none",
        padding: 0,
        position: "relative",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          width: "16px",
          height: "16px",
          borderRadius: "9999px",
          background: "var(--foreground)",
          left: checked ? "18px" : "2px",
          top: "2px",
          transition: "left 200ms ease-in-out",
        }}
      />
    </button>
  );
}

function ThemeSegment({ value, onChange }: { value: Theme; onChange: (v: Theme) => void }) {
  const options: { key: Theme; label: string }[] = [
    { key: "dark", label: "Dark" },
    { key: "light", label: "Light" },
  ];

  return (
    <div
      style={{
        background: "var(--surface-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        padding: "2px",
        display: "flex",
        gap: "2px",
      }}
    >
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          style={{
            height: "28px",
            padding: "0 14px",
            borderRadius: "4px",
            fontSize: "12px",
            fontWeight: 500,
            cursor: "pointer",
            border: "none",
            background: value === opt.key ? "var(--primary)" : "transparent",
            color: value === opt.key ? "var(--primary-foreground)" : "var(--foreground-muted)",
            transition: "background 150ms ease-out, color 150ms ease-out",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function GeneralSettings() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [startMinimized, setStartMinimized] = useState(false);
  const [launchOnStartup, setLaunchOnStartup] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.electronAPI.getConfig().then((data: Record<string, unknown>) => {
      if (!data) return;
      if (data.theme === "light" || data.theme === "dark") setTheme(data.theme);
      if (typeof data.start_minimized === "boolean") setStartMinimized(data.start_minimized);
      if (typeof data.launch_on_startup === "boolean") setLaunchOnStartup(data.launch_on_startup);
    });
  }, []);

  async function handleSave() {
    await window.electronAPI.updateConfig({
      theme,
      start_minimized: startMinimized,
      launch_on_startup: launchOnStartup,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <div
        style={{
          borderBottom: "1px solid var(--border)",
          paddingBottom: "12px",
          marginBottom: "24px",
          fontSize: "18px",
          fontWeight: 700,
          color: "var(--foreground)",
          letterSpacing: "-0.02em",
        }}
      >
        General
      </div>

      <FieldRow
        label="Theme"
        description="Choose between dark and light mode. Only dark mode is currently supported."
      >
        <ThemeSegment value={theme} onChange={setTheme} />
      </FieldRow>

      <FieldRow
        label="Start minimized"
        description="Launch Vex to the system tray without showing the main window."
      >
        <ToggleSwitch checked={startMinimized} onChange={setStartMinimized} />
      </FieldRow>

      <FieldRow
        label="Launch on startup"
        description="Automatically start Vex when you log in to your computer."
      >
        <ToggleSwitch checked={launchOnStartup} onChange={setLaunchOnStartup} />
      </FieldRow>

      <div style={{ marginTop: "24px", display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={handleSave}
          style={{
            height: "32px",
            padding: "0 16px",
            borderRadius: "6px",
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--primary-foreground)",
            background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-active) 100%)",
            border: "none",
            cursor: "pointer",
            transition: "box-shadow 150ms ease-out",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = "0 0 16px hsla(263, 82%, 57.5%, 0.4)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          {saved ? "Saved!" : "Save Preferences"}
        </button>
      </div>
    </div>
  );
}
