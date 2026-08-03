interface FrameworkBadgeProps {
  framework: string | null;
}

const FRAMEWORK_COLORS: Record<string, string> = {
  "next.js": "#ffffff",
  nextjs: "#ffffff",
  react: "#61dafb",
  vue: "#42b883",
  angular: "#dd0031",
  svelte: "#ff3e00",
  django: "#0c4b33",
  flask: "#ffffff",
  express: "#ffffff",
  nuxt: "#00dc82",
  astro: "#ff5d01",
  remix: "#ffffff",
  gatsby: "#663399",
  vite: "#646cff",
};

export function FrameworkBadge({ framework }: FrameworkBadgeProps) {
  if (!framework) return null;

  const color = FRAMEWORK_COLORS[framework.toLowerCase()] || "var(--foreground-muted)";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 8px",
        borderRadius: "var(--radius)",
        background: "var(--surface-elevated)",
        borderLeft: `3px solid ${color}`,
        fontSize: "11px",
        fontFamily: "var(--font-mono)",
        color: "var(--foreground-muted)",
      }}
    >
      {framework}
    </span>
  );
}
