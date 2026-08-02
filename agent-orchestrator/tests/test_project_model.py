"""Tests for per-project settings: model catalog/persistence and auth-header injection."""

import pytest
from agent_orchestrator.db import database
from agent_orchestrator.services import model_catalog


@pytest.fixture(autouse=True)
def reset_catalog_cache():
    model_catalog._cache = None
    model_catalog._cache_at = 0.0
    yield
    model_catalog._cache = None
    model_catalog._cache_at = 0.0


async def test_models_fallback_on_sdk_failure(monkeypatch):
    async def boom():
        raise RuntimeError("CLI not available")

    monkeypatch.setattr(model_catalog, "_fetch_from_sdk", boom)

    result = await model_catalog.list_models()

    assert result["source"] == "fallback"
    values = [m["value"] for m in result["models"]]
    assert "default" in values
    # Failures are not cached — a later successful fetch must be possible.
    assert model_catalog._cache is None


async def test_models_cached_after_first_fetch(monkeypatch):
    calls = 0

    async def fake_fetch():
        nonlocal calls
        calls += 1
        return [
            {"value": "sonnet", "displayName": "Sonnet", "description": ""},
        ]

    monkeypatch.setattr(model_catalog, "_fetch_from_sdk", fake_fetch)

    first = await model_catalog.list_models()
    second = await model_catalog.list_models()

    assert calls == 1
    assert first["source"] == "sdk"
    assert first == second
    # A "default" entry is prepended when the SDK list lacks one.
    assert first["models"][0]["value"] == "default"


@pytest.fixture
async def temp_db(monkeypatch, tmp_path):
    monkeypatch.setattr(database, "DB_DIR", tmp_path)
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "vex.db")
    monkeypatch.setattr(database, "DATA_DIR", tmp_path / "data")
    await database.init_db()
    yield
    await database.close_db()


async def test_project_model_persistence(temp_db, tmp_path):
    from agent_orchestrator.api.projects import create_project, get_project, update_project
    from agent_orchestrator.models.project import ProjectCreate, ProjectUpdate

    project = await create_project(ProjectCreate(path=str(tmp_path)))
    project_id = project["id"]
    assert project["model"] is None

    # Set an explicit model
    updated = await update_project(project_id, ProjectUpdate(model="sonnet"))
    assert updated["model"] == "sonnet"
    fetched = await get_project(project_id)
    assert fetched["model"] == "sonnet"

    # "default" normalizes to NULL
    updated = await update_project(project_id, ProjectUpdate(model="default"))
    assert updated["model"] is None

    # Explicit null also clears
    await update_project(project_id, ProjectUpdate(model="haiku"))
    updated = await update_project(project_id, ProjectUpdate(model=None))
    assert updated["model"] is None


async def test_project_auth_header_persistence_and_redaction(temp_db, tmp_path, monkeypatch):
    from agent_orchestrator.api import projects as projects_api
    from agent_orchestrator.api.projects import (
        create_project,
        get_project,
        list_projects,
        update_project,
    )
    from agent_orchestrator.models.project import ProjectCreate, ProjectUpdate

    events: list[dict] = []

    async def capture(_subject, payload):
        events.append(payload)

    monkeypatch.setattr(projects_api.nats_service, "publish", capture)

    project = await create_project(ProjectCreate(path=str(tmp_path)))
    project_id = project["id"]
    assert project["auth_header"] is None

    # Set a header — round-trips via PATCH and the single (Electron-only) GET.
    header = "Authorization: Bearer secret-token"
    updated = await update_project(project_id, ProjectUpdate(auth_header=header))
    assert updated["auth_header"] == header
    assert (await get_project(project_id))["auth_header"] == header

    # The extension-visible list omits the secret entirely.
    listed = await list_projects()
    assert all("auth_header" not in p for p in listed)

    # The NATS 'updated' event (broadcast to the browser over WS) omits it too.
    updated_events = [e for e in events if e.get("event") == "updated"]
    assert updated_events
    assert all("auth_header" not in e["project"] for e in updated_events)

    # Empty / whitespace-only clears the header to NULL (injection skipped).
    assert (await update_project(project_id, ProjectUpdate(auth_header="")))["auth_header"] is None
    await update_project(project_id, ProjectUpdate(auth_header=header))
    assert (await update_project(project_id, ProjectUpdate(auth_header="   ")))["auth_header"] is None


def test_parse_headers():
    from agent_orchestrator.adapters.claude_code_sdk import _parse_headers

    assert _parse_headers("Authorization: Bearer abc") == {"Authorization": "Bearer abc"}
    # Multiple lines; blank and colon-less lines are skipped when other lines have colons.
    assert _parse_headers("A: 1\n\nB: 2") == {"A": "1", "B": "2"}
    assert _parse_headers("") == {}
    assert _parse_headers(None) == {}
    # A value may itself contain colons (e.g. a URL).
    assert _parse_headers("X-Origin: http://host:8080") == {"X-Origin": "http://host:8080"}
    # A bare token (no colon, e.g. a pasted JWT) is wrapped as a Bearer header.
    assert _parse_headers("eyJhbGci.payload.sig") == {"Authorization": "Bearer eyJhbGci.payload.sig"}
    # A leading "Bearer " is not doubled.
    assert _parse_headers("Bearer eyJabc") == {"Authorization": "Bearer eyJabc"}


def test_inject_playwright_auth(tmp_path, monkeypatch):
    import json

    from agent_orchestrator.adapters import claude_code_sdk as sdk

    monkeypatch.setattr(sdk, "_PW_CONFIG_DIR", tmp_path)
    servers = {
        "playwright-vex": {"command": "npx", "args": ["@playwright/mcp@latest", "--isolated"]},
    }

    # No auth → same object, no config file written.
    out, cfg = sdk._inject_playwright_auth(servers, None, "AG1")
    assert out is servers
    assert cfg is None

    # With auth → deep-copied rewrite; original untouched; config written with headers.
    out, cfg = sdk._inject_playwright_auth(servers, "Authorization: Bearer X", "AG2")
    assert servers["playwright-vex"]["args"] == ["@playwright/mcp@latest", "--isolated"]
    assert out["playwright-vex"]["args"] == ["@playwright/mcp@latest", "--config", str(cfg)]
    data = json.loads(cfg.read_text())
    assert data["browser"]["isolated"] is True
    assert data["browser"]["contextOptions"]["extraHTTPHeaders"] == {"Authorization": "Bearer X"}

    # Auth set but no playwright-vex server → no-op.
    out, cfg = sdk._inject_playwright_auth({"other": {}}, "Authorization: Bearer X", "AG3")
    assert cfg is None
