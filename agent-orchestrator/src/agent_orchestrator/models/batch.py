"""Batch and Action models for the REST API."""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class BatchStatus(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ActionData(BaseModel):
    """Flat union of all 12 action types. Type-specific fields are optional."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    type: str
    selector: str
    timestamp: str | None = None
    screenshot_before: str | None = None  # base64 JPEG
    screenshot_after: str | None = None  # base64 JPEG

    # select
    instruction: str | None = None
    element_info: dict | None = None

    # insert
    position: str | None = None  # after|before|firstChild|lastChild
    reference_selector: str | None = None
    content: dict | None = None  # { tag, text, attributes }

    # editText
    before: str | None = None
    after: str | None = None

    # delete
    deleted_outer_html: str | None = None

    # duplicate
    inserted_after: str | None = None

    # move
    parent_selector: str | None = None
    from_index: int | None = None
    to_index: int | None = None

    # wrap
    wrapper: dict | None = None  # { tag, classList }

    # resize
    before_styles: dict | None = None
    after_styles: dict | None = None
    deltas: list[dict] | None = None

    # styleChange
    changes: list[dict] | None = None
    hover_changes: list[dict] | None = None
    transition: dict | None = None

    # replaceImage
    original_src: str | None = None
    method: str | None = None  # upload|url|generate
    prompt: str | None = None
    dimensions: dict | None = None
    generated_url: str | None = None

    # generateSection
    style_hint: str | None = None
    generated_html: str | None = None

    # copyStyle
    from_selector: str | None = None
    to_selector: str | None = None
    copied_properties: dict | None = None


class BatchSubmission(BaseModel):
    """Incoming batch from the Chrome Extension."""

    batch: "BatchPayload"


class BatchPayload(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    page_url: str
    page_title: str
    actions: list[ActionData]
    timestamp: str


class BatchSummary(BaseModel):
    id: str
    project_id: str
    page_url: str
    page_title: str
    action_count: int
    status: BatchStatus = BatchStatus.PENDING
    duration_ms: int | None = None
    cost_usd: float | None = None
    error_message: str | None = None
    agent_id: str | None = None
    submitted_at: str
    completed_at: str | None = None


class BatchDetail(BatchSummary):
    actions: list[ActionData]
