from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Channel = Literal["instagram", "tiktok", "sms", "voice", "web", "email"]


class InboundAttachment(BaseModel):
    type: str
    url: str | None = None


class InboundMessage(BaseModel):
    """Canonical inbound message. Channel adapters normalize platform
    payloads into this shape before handing them to the agent loop."""

    channel: Channel
    clinic_id: str
    platform_thread_id: str
    platform_msg_id: str
    sender_handle: str
    sender_name: str | None = None
    text: str = ""
    attachments: list[InboundAttachment] = Field(default_factory=list)
    received_at: datetime
