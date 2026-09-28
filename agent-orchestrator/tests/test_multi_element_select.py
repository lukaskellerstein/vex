"""Tests for select actions that target several elements with one instruction."""

import json
from pathlib import Path

import pytest
from agent_orchestrator.db import database
from agent_orchestrator.models.batch import BatchSubmission
from agent_orchestrator.services import screenshot_store
from agent_orchestrator.services.batch_processor import _action_to_dict, _build_prompt

PROJECT = {
    "path": "/tmp/app",
    "framework": "react",
    "styling_approach": "tailwind",
    "auth_header": None,
}


def _submission(extra_elements: list[dict] | None) -> BatchSubmission:
    action = {
        "type": "select",
        "selector": "div.card:nth-child(1)",
        "instruction": "Make these cards the same height",
        "tagName": "div",
        "classList": ["card"],
        "reactComponent": "PricingCard",
        "screenshotBefore": "aGVsbG8=",
    }
    if extra_elements is not None:
        action["extraElements"] = extra_elements
    return BatchSubmission.model_validate(
        {
            "batch": {
                "pageUrl": "http://localhost:3000/pricing",
                "pageTitle": "Pricing",
                "actions": [action],
                "timestamp": "2026-09-27T10:00:00Z",
            }
        }
    )


def _prompt_for(submission: BatchSubmission) -> tuple[str, dict]:
    action = submission.batch.actions[0]
    data = action.model_dump(exclude={"screenshot_before", "screenshot_after"})
    row = {"type": action.type, "selector": action.selector}
    return _build_prompt(PROJECT, row, data, "/shots/1.jpg"), data


def test_extra_elements_parse_from_camel_case():
    submission = _submission(
        [{"selector": "div.card:nth-child(2)", "tagName": "div", "reactSourceFile": "src/Card.tsx:12"}]
    )

    extra = submission.batch.actions[0].extra_elements

    assert extra is not None
    assert extra[0].selector == "div.card:nth-child(2)"
    assert extra[0].react_source_file == "src/Card.tsx:12"


def test_prompt_lists_every_element_of_a_group():
    prompt, data = _prompt_for(
        _submission([{"selector": "div.card:nth-child(2)", "tagName": "div", "textContent": "Pro plan"}])
    )

    assert "[select] 2 elements: `div.card:nth-child(1)`, `div.card:nth-child(2)`" in prompt
    assert "**Instruction**: Make these cards the same height" in prompt
    assert "### Element 1.1: `div.card:nth-child(1)`" in prompt
    assert "### Element 1.2: `div.card:nth-child(2)`" in prompt
    assert "**React component**: `PricingCard`" in prompt
    assert "**Text**: `Pro plan`" in prompt
    assert "`/shots/1.jpg`" in prompt
    assert _action_to_dict({"type": "select", "selector": "x"}, data)["extra_elements"][0]["selector"] == (
        "div.card:nth-child(2)"
    )


def test_single_element_prompt_is_unchanged():
    prompt, _ = _prompt_for(_submission(None))

    assert "**Action**: [select] `div.card:nth-child(1)`" in prompt
    assert "## Element Context" in prompt
    assert "## Elements" not in prompt


def test_prompt_lists_every_view():
    submission = _submission([{"selector": "footer a", "tagName": "a"}])
    action = submission.batch.actions[0]
    data = action.model_dump(exclude={"screenshot_before", "screenshot_after", "extra_screenshots"})
    data["extra_screenshot_paths"] = ["/shots/2.jpg"]

    prompt = _build_prompt(PROJECT, {"type": "select", "selector": action.selector}, data, "/shots/1.jpg")

    assert "- **View 1** (current state; badges mark the elements): `/shots/1.jpg`" in prompt
    assert "- **View 2** (current state; badges mark the elements): `/shots/2.jpg`" in prompt
    assert "**Reference**" not in prompt


@pytest.fixture
async def temp_db(monkeypatch, tmp_path):
    monkeypatch.setattr(database, "DB_DIR", tmp_path)
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "vex.db")
    monkeypatch.setattr(screenshot_store, "DATA_DIR", tmp_path / "data")
    await database.init_db()
    yield
    await database.close_db()


async def test_extra_views_are_saved_and_deleted_with_the_batch(temp_db, tmp_path, monkeypatch):
    from agent_orchestrator.api import batches as batches_api
    from agent_orchestrator.api.projects import create_project
    from agent_orchestrator.models.project import ProjectCreate

    async def no_publish(_subject, _payload):
        return None

    async def no_processing(_project_id, _batch_id):
        return None

    monkeypatch.setattr(batches_api.nats_service, "publish", no_publish)
    monkeypatch.setattr(batches_api.batch_processor, "process_batch", no_processing)
    project = await create_project(ProjectCreate(path=str(tmp_path)))

    submission = _submission([{"selector": "footer a", "tagName": "a"}])
    submission.batch.actions[0].extra_screenshots = ["d29ybGQ="]
    summary = await batches_api.submit_batch(project["id"], submission)

    db = await database.get_db()
    cursor = await db.execute("SELECT data FROM actions WHERE batch_id = ?", (summary["id"],))
    data = json.loads((await cursor.fetchone())["data"])
    assert "extra_screenshots" not in data
    [extra_path] = data["extra_screenshot_paths"]
    assert Path(extra_path).read_bytes() == b"world"

    await batches_api.delete_batch(project["id"], summary["id"])

    assert not Path(extra_path).exists()
