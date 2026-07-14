"""Model catalog endpoint."""

from fastapi import APIRouter

from agent_orchestrator.services import model_catalog

router = APIRouter(tags=["models"])


@router.get("/models")
async def list_models():
    return await model_catalog.list_models()
