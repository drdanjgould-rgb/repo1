"""LLM abstraction. Anthropic by default; OpenAI adapter can drop in here.

Prompt caching is enabled via ``cache_control`` markers on the system block
and clinic block. Hit rate is high in steady state because both blocks are
stable across messages within a conversation.
"""
from __future__ import annotations

from typing import Any, Protocol

import anthropic
from anthropic.types import MessageParam

from apps.api.config import get_settings


class LLM(Protocol):
    async def tool_call(
        self,
        *,
        model: str,
        system: list[dict[str, Any]],
        messages: list[MessageParam],
        tools: list[dict[str, Any]],
        tool_choice: dict[str, Any] | None = None,
        max_tokens: int = 1024,
    ) -> dict[str, Any]:
        """Run a single LLM turn that must call exactly one tool. Returns the
        tool input dict (validated by caller against its Pydantic schema)."""
        ...


class AnthropicLLM:
    def __init__(self, api_key: str | None = None) -> None:
        key = api_key or get_settings().anthropic_api_key
        self._client = anthropic.AsyncAnthropic(api_key=key)

    async def tool_call(
        self,
        *,
        model: str,
        system: list[dict[str, Any]],
        messages: list[MessageParam],
        tools: list[dict[str, Any]],
        tool_choice: dict[str, Any] | None = None,
        max_tokens: int = 1024,
    ) -> dict[str, Any]:
        resp = await self._client.messages.create(
            model=model,
            system=system,
            messages=messages,
            tools=tools,
            tool_choice=tool_choice or {"type": "any"},
            max_tokens=max_tokens,
        )
        for block in resp.content:
            if block.type == "tool_use":
                return {
                    "name": block.name,
                    "input": block.input,
                    "usage": {
                        "input_tokens": resp.usage.input_tokens,
                        "output_tokens": resp.usage.output_tokens,
                        "cache_read_input_tokens": getattr(
                            resp.usage, "cache_read_input_tokens", 0
                        ),
                        "cache_creation_input_tokens": getattr(
                            resp.usage, "cache_creation_input_tokens", 0
                        ),
                    },
                    "stop_reason": resp.stop_reason,
                }
        raise RuntimeError(
            f"Model did not call a tool. stop_reason={resp.stop_reason}, "
            f"content={resp.content!r}"
        )


def get_llm() -> LLM:
    return AnthropicLLM()
