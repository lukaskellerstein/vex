# Contract: AgentAdapter Interface

**Branch**: `003-full-run-with-extension-fixes` | **Date**: 2026-03-30

## Interface

```python
class AgentAdapter(ABC):
    name: str
    capabilities: list[str]

    async def start(project_id: str, project_path: str) -> AgentProcess
    async def stop(agent_id: str) -> None
    async def send_task(agent_id: str, task: dict) -> None
    async def get_status(agent_id: str) -> str
    async def subscribe_logs(agent_id: str) -> AsyncIterator[str]
```

## Task Dict Shape

```python
{
    "project_id": str,
    "type": str,           # "code-edit", "section-generation"
    "prompt": str,         # Formatted prompt with batch actions
    "context": {
        "project_path": str,
        "framework": str,
        "styling_approach": str,
        "batch_id": str,
        "actions": list[dict],
    }
}
```

## SDK Configuration

```python
ClaudeAgentOptions(
    system_prompt=<project context + task instructions>,
    model="claude-sonnet-4-5-20250929",
    max_turns=10,
    permission_mode="bypassPermissions",
    allowed_tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
)
```
