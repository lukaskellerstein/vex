# Contract: AgentAdapter Interface

**Branch**: `002-first-full-run` | **Date**: 2026-03-30

## Interface

The `AgentAdapter` abstract base class defines the contract for all agent integrations. The `ClaudeCodeSDKAdapter` must implement this interface with real Claude Agent SDK calls.

```python
class AgentAdapter(ABC):
    name: str                    # Adapter identifier (e.g., "claude-code-sdk")
    capabilities: list[str]      # What this adapter can do

    async def start(self, project_id: str, project_path: str) -> AgentProcess
    # Returns: AgentProcess(agent_id=str, pid=int|None)
    # Creates a ClaudeSDKClient, stores it keyed by agent_id
    # Must not block — client creation is fast

    async def stop(self, agent_id: str) -> None
    # Closes the ClaudeSDKClient async context
    # Removes agent from internal tracking

    async def send_task(self, agent_id: str, task: dict) -> None
    # task keys: project_id, type, prompt, context
    # Calls client.query(prompt) and processes response
    # Publishes progress to NATS: vex.agent.{agent_id}.status
    # Stores result when complete

    async def get_status(self, agent_id: str) -> str
    # Returns real status: "idle", "running", "completed", "failed", "stopped"
    # Based on internal SDKAgentSession state

    async def subscribe_logs(self, agent_id: str) -> AsyncIterator[str]
    # Yields real-time output from the SDK response stream
    # TextBlock.text, ToolUseBlock tool names, ResultMessage summary
```

## Task Dict Shape

```python
{
    "project_id": str,           # UUID
    "type": str,                 # e.g., "code-edit", "section-generation"
    "prompt": str,               # Formatted prompt with batch actions
    "context": {
        "project_path": str,     # Absolute path to project
        "framework": str,        # e.g., "next", "react", "vue"
        "styling_approach": str, # e.g., "tailwind", "css-modules"
        "batch_id": str,         # Reference to batch
        "actions": list[dict],   # Structured action data
    }
}
```

## SDK Configuration for Agent

```python
ClaudeAgentOptions(
    system_prompt=<project context + task instructions>,
    model="claude-sonnet-4-5-20250929",
    max_turns=10,
    permission_mode="bypassPermissions",
    allowed_tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
)
```
