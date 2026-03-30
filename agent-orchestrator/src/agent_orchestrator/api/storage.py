"""Storage management endpoints."""

from pathlib import Path

from fastapi import APIRouter, Response, status

from agent_orchestrator.db.database import DB_PATH, DATA_DIR

router = APIRouter(tags=["storage"])


def _dir_size(path: Path) -> int:
    total = 0
    if path.exists():
        for f in path.rglob("*"):
            if f.is_file():
                total += f.stat().st_size
    return total


@router.get("/storage/stats")
async def storage_stats():
    db_bytes = DB_PATH.stat().st_size if DB_PATH.exists() else 0
    screenshots_bytes = _dir_size(DATA_DIR)
    return {
        "database_bytes": db_bytes,
        "screenshots_bytes": screenshots_bytes,
        "total_bytes": db_bytes + screenshots_bytes,
    }


@router.delete("/storage/screenshots", status_code=status.HTTP_200_OK)
async def clear_screenshots():
    deleted = 0
    if DATA_DIR.exists():
        for f in DATA_DIR.rglob("*"):
            if f.is_file():
                f.unlink()
                deleted += 1
    return {"deleted": deleted}
