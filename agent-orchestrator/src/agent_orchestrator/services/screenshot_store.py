"""File-based screenshot storage service."""

import base64
import uuid
from pathlib import Path

from agent_orchestrator.db.database import DATA_DIR


def get_project_data_dir(project_id: str) -> Path:
    """Get or create the data directory for a project."""
    project_dir = DATA_DIR / project_id
    project_dir.mkdir(parents=True, exist_ok=True)
    return project_dir


def save_screenshot(project_id: str, base64_data: str) -> str:
    """Save a base64 JPEG screenshot to disk and return the file path."""
    project_dir = get_project_data_dir(project_id)
    filename = f"{uuid.uuid4().hex}.jpg"
    filepath = project_dir / filename

    image_data = base64.b64decode(base64_data)
    filepath.write_bytes(image_data)

    return str(filepath)


def delete_screenshot(filepath: str) -> None:
    """Delete a screenshot file if it exists."""
    path = Path(filepath)
    if path.exists():
        path.unlink()
