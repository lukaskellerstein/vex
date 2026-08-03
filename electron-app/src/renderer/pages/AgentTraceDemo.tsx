import { ArrowLeft, Bot } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { AgentStep } from "../components/project-detail/AgentStepItem";
import { AgentStepList } from "../components/project-detail/AgentStepList";

const DEMO_STEPS: AgentStep[] = [
  {
    id: "d-1",
    sequence_index: 1,
    type: "thinking",
    content:
      "I need to update the hero section styling. Let me analyze the project's framework and styling approach first, then use the image-generation skill to create a hero background.",
    metadata: null,
    duration_ms: 1200,
    token_count: 340,
    created_at: "2026-03-31T10:00:00Z",
  },
  {
    id: "d-2",
    sequence_index: 2,
    type: "tool_call",
    content: '{"pattern":"src/components/Hero.*"}',
    metadata: { tool_name: "Glob" },
    duration_ms: 45,
    token_count: null,
    created_at: "2026-03-31T10:00:01Z",
  },
  {
    id: "d-3",
    sequence_index: 3,
    type: "tool_result",
    content: "src/components/HeroSection.tsx\nsrc/components/HeroBackground.tsx",
    metadata: null,
    duration_ms: null,
    token_count: null,
    created_at: "2026-03-31T10:00:01Z",
  },
  {
    id: "d-4",
    sequence_index: 4,
    type: "text",
    content:
      "Found the hero components. I'll generate a background image using the media plugin, then update the component styling.",
    metadata: null,
    duration_ms: null,
    token_count: 120,
    created_at: "2026-03-31T10:00:02Z",
  },

  // ── Skill invoke + result ──
  {
    id: "d-5",
    sequence_index: 5,
    type: "skill_invoke",
    content:
      "image A futuristic gradient hero background, dark purple to deep blue, subtle geometric patterns, 16:9 aspect ratio",
    metadata: { skill_name: "image-generation" },
    duration_ms: null,
    token_count: null,
    created_at: "2026-03-31T10:00:03Z",
  },
  {
    id: "d-6",
    sequence_index: 6,
    type: "skill_result",
    content: "Generated image saved to output/media/hero-bg-2026-03-31.png (1920x1080, 245KB)",
    metadata: { skill_name: "image-generation" },
    duration_ms: 8500,
    token_count: null,
    created_at: "2026-03-31T10:00:11Z",
  },

  // ── Another skill ──
  {
    id: "d-7",
    sequence_index: 7,
    type: "skill_invoke",
    content: 'speech "Welcome to the future of web development" --voice warm --style professional',
    metadata: { skill_name: "speech-generation" },
    duration_ms: null,
    token_count: null,
    created_at: "2026-03-31T10:00:12Z",
  },
  {
    id: "d-8",
    sequence_index: 8,
    type: "skill_result",
    content: "Generated speech saved to output/media/welcome-voiceover.mp3 (4.2s, 68KB)",
    metadata: { skill_name: "speech-generation" },
    duration_ms: 3200,
    token_count: null,
    created_at: "2026-03-31T10:00:15Z",
  },

  // ── Subagent spawn + result ──
  {
    id: "d-9",
    sequence_index: 9,
    type: "subagent_spawn",
    content:
      "Analyze the existing CSS variables and design tokens in the project to ensure the new hero section matches the design system.",
    metadata: { subagent_name: "Explore", subagent_id: "sub-explore-001" },
    duration_ms: null,
    token_count: null,
    created_at: "2026-03-31T10:00:16Z",
  },
  {
    id: "d-10",
    sequence_index: 10,
    type: "subagent_result",
    content:
      "Design tokens found: --color-primary: hsl(262, 83%, 58%), --color-bg-dark: hsl(240, 20%, 8%), --radius-lg: 12px. The project uses CSS custom properties with a Catppuccin Mocha-derived palette.",
    metadata: { subagent_name: "Explore", subagent_id: "sub-explore-001" },
    duration_ms: 4500,
    token_count: 890,
    created_at: "2026-03-31T10:00:20Z",
  },

  // ── Another subagent ──
  {
    id: "d-11",
    sequence_index: 11,
    type: "subagent_spawn",
    content:
      "Review accessibility of the hero section: check color contrast ratios, ARIA labels, and keyboard navigation.",
    metadata: { subagent_name: "Plan", subagent_id: "sub-plan-002" },
    duration_ms: null,
    token_count: null,
    created_at: "2026-03-31T10:00:21Z",
  },
  {
    id: "d-12",
    sequence_index: 12,
    type: "subagent_result",
    content:
      "Accessibility audit complete: contrast ratio 7.2:1 (passes AAA), all interactive elements have ARIA labels, tab order is correct. One suggestion: add aria-live region for the animated tagline.",
    metadata: { subagent_name: "Plan", subagent_id: "sub-plan-002" },
    duration_ms: 6200,
    token_count: 1240,
    created_at: "2026-03-31T10:00:27Z",
  },

  // ── Edit + diff ──
  {
    id: "d-13",
    sequence_index: 13,
    type: "tool_call",
    content:
      '{"file_path":"src/components/HeroSection.tsx","old_string":"background: var(--color-bg)","new_string":"background: url(\'/media/hero-bg.png\') center/cover no-repeat, var(--color-bg-dark)"}',
    metadata: { tool_name: "Edit" },
    duration_ms: 120,
    token_count: null,
    created_at: "2026-03-31T10:00:28Z",
  },
  {
    id: "d-14",
    sequence_index: 14,
    type: "diff",
    content:
      "src/components/HeroSection.tsx\n- background: var(--color-bg)\n+ background: url('/media/hero-bg.png') center/cover no-repeat, var(--color-bg-dark)",
    metadata: null,
    duration_ms: null,
    token_count: null,
    created_at: "2026-03-31T10:00:28Z",
  },

  // ── Media director subagent ──
  {
    id: "d-15",
    sequence_index: 15,
    type: "subagent_spawn",
    content:
      "Create a short promotional video combining the hero background with the voiceover and background music for the landing page.",
    metadata: { subagent_name: "media-director", subagent_id: "sub-media-003" },
    duration_ms: null,
    token_count: null,
    created_at: "2026-03-31T10:00:30Z",
  },
  {
    id: "d-16",
    sequence_index: 16,
    type: "skill_invoke",
    content: "music ambient electronic background, subtle and modern, 90 BPM, C minor",
    metadata: { skill_name: "music-generation" },
    duration_ms: null,
    token_count: null,
    created_at: "2026-03-31T10:00:35Z",
  },
  {
    id: "d-17",
    sequence_index: 17,
    type: "skill_result",
    content: "Generated music saved to output/media/ambient-bg-track.mp3 (30s, 480KB)",
    metadata: { skill_name: "music-generation" },
    duration_ms: 12000,
    token_count: null,
    created_at: "2026-03-31T10:00:47Z",
  },
  {
    id: "d-18",
    sequence_index: 18,
    type: "subagent_result",
    content:
      "Promotional video assembled: output/media/hero-promo.mp4 (15s, 1080p, 4.2MB). Combined hero background animation, voiceover, and ambient music track with ffmpeg.",
    metadata: { subagent_name: "media-director", subagent_id: "sub-media-003" },
    duration_ms: 25000,
    token_count: 3400,
    created_at: "2026-03-31T10:00:55Z",
  },

  // ── Completion ──
  {
    id: "d-19",
    sequence_index: 19,
    type: "completed",
    content:
      "Completed in 55000ms — hero section updated with generated background, voiceover, and promo video.",
    metadata: null,
    duration_ms: 55000,
    token_count: 6200,
    created_at: "2026-03-31T10:00:55Z",
  },
];

export function AgentTraceDemo() {
  const navigate = useNavigate();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <header
        style={{
          flexShrink: 0,
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 20px",
            height: "48px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              onClick={() => navigate(-1)}
              style={{
                width: "28px",
                height: "28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--radius)",
                color: "var(--foreground-muted)",
                cursor: "pointer",
                background: "none",
                border: "none",
              }}
            >
              <ArrowLeft size={16} />
            </button>
            <Bot size={16} style={{ color: "var(--primary)" }} />
            <span style={{ fontSize: "16px", fontWeight: 600, color: "var(--foreground)" }}>
              Demo Agent — Hook Step Types
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "2px 8px",
                borderRadius: "var(--radius)",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                fontWeight: 500,
                background: "color-mix(in srgb, var(--status-warning) 15%, transparent)",
                color: "var(--status-warning)",
                border: "1px solid color-mix(in srgb, var(--status-warning) 30%, transparent)",
              }}
            >
              DEMO DATA
            </span>
          </div>
        </div>
      </header>

      {/* Steps */}
      <AgentStepList steps={DEMO_STEPS} status="completed" />
    </div>
  );
}
