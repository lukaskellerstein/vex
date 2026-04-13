"""Parse Claude SDK JSONL transcript files into TraceStep-compatible dicts."""

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def parse_transcript(
    path: str | Path,
    max_steps: int = 2000,
) -> tuple[list[dict], int]:
    """Parse a JSONL transcript file into a list of step dicts.

    Returns (steps, skipped_count) where skipped_count is the number
    of malformed or skipped lines.
    """
    file_path = Path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"Transcript file not found at {file_path}")

    steps: list[dict] = []
    skipped = 0
    seq = 0

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
            ts = record.get("ts", "")

            if record_type in ("start", "config"):
                continue

            if record_type == "finish":
                steps.append({
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
                })
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

    return steps, skipped


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
