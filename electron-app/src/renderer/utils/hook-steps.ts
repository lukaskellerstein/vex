import type { AgentStep } from "../components/project-detail/AgentStepItem";

/** Convert a hook event from the vex.agent.{id}.hooks NATS channel into an AgentStep. */
export function hookEventToStep(data: Record<string, unknown>): AgentStep | null {
  const hook = data.hook as string;
  const ts = (data.timestamp as string) ?? new Date().toISOString();
  const id = `hook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  switch (hook) {
    case "SubagentStart":
      return {
        id,
        sequence_index: Date.now(),
        type: "subagent_spawn",
        content: (data.subagent_prompt as string) ?? null,
        metadata: {
          subagent_name: (data.subagent_type as string) ?? "subagent",
          subagent_id: (data.subagent_id as string) ?? "",
        },
        duration_ms: null,
        token_count: null,
        created_at: ts,
      };

    case "SubagentStop":
      return {
        id,
        sequence_index: Date.now(),
        type: "subagent_result",
        content: `Subagent ${(data.subagent_type as string) ?? ""} completed`,
        metadata: {
          subagent_name: (data.subagent_type as string) ?? "subagent",
          subagent_id: (data.subagent_id as string) ?? "",
          transcript_path: (data.transcript_path as string) ?? "",
        },
        duration_ms: null,
        token_count: null,
        created_at: ts,
      };

    case "PreToolUse": {
      const toolName = data.tool_name as string;
      if (toolName === "Skill") {
        return {
          id,
          sequence_index: Date.now(),
          type: "skill_invoke",
          content: (data.skill_args as string) ?? null,
          metadata: { skill_name: (data.skill_name as string) ?? "skill" },
          duration_ms: null,
          token_count: null,
          created_at: ts,
        };
      }
      if (toolName === "Agent") {
        return {
          id,
          sequence_index: Date.now(),
          type: "subagent_spawn",
          content: (data.subagent_description as string) ?? null,
          metadata: { subagent_name: (data.subagent_agent_type as string) ?? "subagent" },
          duration_ms: null,
          token_count: null,
          created_at: ts,
        };
      }
      return null;
    }

    case "PostToolUse": {
      const toolName = data.tool_name as string;
      if (toolName === "Skill") {
        return {
          id,
          sequence_index: Date.now(),
          type: "skill_result",
          content: (data.response_preview as string) ?? "Skill completed",
          metadata: { skill_name: (data.skill_name as string) ?? "skill" },
          duration_ms: null,
          token_count: null,
          created_at: ts,
        };
      }
      if (toolName === "Agent") {
        return {
          id,
          sequence_index: Date.now(),
          type: "subagent_result",
          content: (data.response_preview as string) ?? "Subagent completed",
          metadata: { subagent_name: (data.subagent_description as string) ?? "subagent" },
          duration_ms: null,
          token_count: null,
          created_at: ts,
        };
      }
      return null;
    }

    default:
      return null;
  }
}
