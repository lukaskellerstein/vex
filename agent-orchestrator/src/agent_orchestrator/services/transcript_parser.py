"""Parse Claude SDK JSONL transcript files into TraceStep-compatible dicts.

Supports two JSONL formats:
- **SDK event format**: records with type="event"|"start"|"config"|"finish"
  and content blocks (used by the main agent trace).
- **Conversation format**: records with type="user"|"assistant" and a
  message object containing role + content (used by subagent transcripts).
"""

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def parse_transcript(
    path: str | Path,
    max_steps: int = 2000,
) -> tuple[list[dict], int, str | None]:
    """Parse a JSONL transcript file into a list of step dicts.

    Returns (steps, skipped_count, prompt) where skipped_count is the
    number of malformed or skipped lines, and prompt is the initial user
    message (if found in conversation-format transcripts).
    """
    file_path = Path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"Transcript file not found at {file_path}")

    steps: list[dict] = []
    skipped = 0
    seq = 0
    prompt: str | None = None

    with file_path.open("r", encoding="utf-8") as f:
        for line_num, line in enumerate(f):
            line = line.strip()
            if not line:
                continue

            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                skipped += 1
                logger.warning("Malformed JSON at line %d in %s", line_num, path)
                continue

            record_type = record.get("type", "")

            # --- Conversation format (subagent transcripts) ---
            if record_type in ("user", "assistant") and "message" in record:
                new_steps, extracted_prompt = _parse_conversation_record(
                    record,
                    seq,
                    capture_prompt=prompt is None,
                )
                if extracted_prompt and prompt is None:
                    prompt = extracted_prompt
                if new_steps:
                    steps.extend(new_steps)
                    seq += len(new_steps)
                    if seq >= max_steps:
                        steps = steps[:max_steps]
                        break
                continue

            # --- SDK event format (main agent transcripts) ---
            ts = record.get("ts", "")

            if record_type in ("start", "config"):
                continue

            if record_type == "finish":
                steps.append(
                    {
                        "id": f"step-{seq}",
                        "sequence_index": seq,
                        "type": "completed",
                        "content": f"Agent {record.get('status', 'finished')}",
                        "metadata": {
                            "status": record.get("status"),
                            "cost_usd": record.get("cost_usd"),
                            "duration_ms": record.get("duration_ms"),
                            "events": record.get("events"),
                        },
                        "duration_ms": record.get("duration_ms"),
                        "token_count": None,
                        "created_at": ts,
                    }
                )
                seq += 1
                if seq >= max_steps:
                    break
                continue

            if record_type == "event":
                step = _parse_event(record, seq, ts)
                if step:
                    steps.append(step)
                    seq += 1
                    if seq >= max_steps:
                        break
                else:
                    skipped += 1
                continue

            skipped += 1

    return steps, skipped, prompt


def _parse_conversation_record(
    record: dict,
    seq: int,
    *,
    capture_prompt: bool = False,
) -> tuple[list[dict], str | None]:
    """Convert a conversation-format record into one or more step dicts.

    A single record can contain multiple content blocks (e.g. a text block
    followed by a tool_use block), so we return (steps, prompt).
    prompt is non-None only when capture_prompt is True and this is a
    plain-string user message (the initial subagent prompt).
    """
    ts = record.get("timestamp", "")
    message = record.get("message", {})
    content = message.get("content")
    role = message.get("role", "")

    if content is None:
        return [], None

    # User messages with a plain string are the initial prompt — capture
    # but don't emit as a step (the frontend injects a synthetic prompt step).
    if isinstance(content, str):
        if role == "user":
            return [], content if capture_prompt else None
        return [
            {
                "id": f"step-{seq}",
                "sequence_index": seq,
                "type": "text",
                "content": content,
                "metadata": None,
                "duration_ms": None,
                "token_count": None,
                "created_at": ts,
            }
        ], None

    if not isinstance(content, list):
        return [], None

    steps: list[dict] = []
    for block in content:
        if not isinstance(block, dict):
            continue
        block_type = block.get("type", "")
        step = _conversation_block_to_step(block, block_type, seq + len(steps), ts)
        if step:
            steps.append(step)

    return steps, None


def _conversation_block_to_step(
    block: dict,
    block_type: str,
    seq: int,
    ts: str,
) -> dict | None:
    """Map a single content block from conversation format to a step dict."""
    if block_type == "text":
        text = block.get("text", "")
        if not text:
            return None
        return {
            "id": f"step-{seq}",
            "sequence_index": seq,
            "type": "text",
            "content": text,
            "metadata": None,
            "duration_ms": None,
            "token_count": None,
            "created_at": ts,
        }

    if block_type == "thinking":
        return {
            "id": f"step-{seq}",
            "sequence_index": seq,
            "type": "thinking",
            "content": block.get("thinking", ""),
            "metadata": None,
            "duration_ms": None,
            "token_count": None,
            "created_at": ts,
        }

    if block_type == "tool_use":
        return {
            "id": f"step-{seq}",
            "sequence_index": seq,
            "type": "tool_call",
            "content": None,
            "metadata": {
                "tool_name": block.get("name", ""),
                "tool_input": block.get("input", {}),
            },
            "duration_ms": None,
            "token_count": None,
            "created_at": ts,
        }

    if block_type == "tool_result":
        content = block.get("content", "")
        if isinstance(content, list):
            # Flatten list of text blocks into a single string
            parts = []
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    parts.append(item.get("text", ""))
                elif isinstance(item, str):
                    parts.append(item)
            content = "\n".join(parts)
        return {
            "id": f"step-{seq}",
            "sequence_index": seq,
            "type": "tool_result",
            "content": content,
            "metadata": {
                "tool_name": "",
                "is_error": block.get("is_error", False),
            },
            "duration_ms": None,
            "token_count": None,
            "created_at": ts,
        }

    return None


def _parse_event(record: dict, seq: int, ts: str) -> dict | None:
    """Convert an event record to a step dict."""
    content_block = record.get("content", {})
    if not isinstance(content_block, dict):
        return None

    block_type = content_block.get("type", "")

    if block_type == "text":
        return {
            "id": f"step-{seq}",
            "sequence_index": seq,
            "type": "text",
            "content": content_block.get("text", ""),
            "metadata": None,
            "duration_ms": None,
            "token_count": None,
            "created_at": ts,
        }

    if block_type == "thinking":
        return {
            "id": f"step-{seq}",
            "sequence_index": seq,
            "type": "thinking",
            "content": content_block.get("thinking", ""),
            "metadata": None,
            "duration_ms": None,
            "token_count": None,
            "created_at": ts,
        }

    if block_type == "tool_use":
        return {
            "id": f"step-{seq}",
            "sequence_index": seq,
            "type": "tool_call",
            "content": None,
            "metadata": {
                "tool_name": content_block.get("name", ""),
                "tool_input": content_block.get("input", {}),
            },
            "duration_ms": None,
            "token_count": None,
            "created_at": ts,
        }

    if block_type == "tool_result":
        return {
            "id": f"step-{seq}",
            "sequence_index": seq,
            "type": "tool_result",
            "content": content_block.get("content", ""),
            "metadata": {
                "tool_name": content_block.get("name", ""),
                "is_error": content_block.get("is_error", False),
            },
            "duration_ms": None,
            "token_count": None,
            "created_at": ts,
        }

    return None
