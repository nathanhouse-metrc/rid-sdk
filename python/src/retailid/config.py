# Copyright 2025 Metrc, LLC
# SPDX-License-Identifier: MIT
"""
Load Retail ID API credentials and connection settings from ``config.json``.

Keep API keys out of source code: put them in a ``config.json`` that is not
committed (see ``config.example.json``)::

    {
        "vendor_api_key": "...",
        "user_api_key": "...",
        "state_code": "md"
    }

``base_url`` may be given instead of ``state_code`` (use it for the Sandbox).
``timeout``, ``max_retries`` and ``backoff_base`` are optional.
"""

from __future__ import annotations

import json
import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Union

from .errors import RetailIdConfigError

__all__ = ["CONFIG_ENV_VAR", "DEFAULT_CONFIG_FILE", "RetailIdConfig", "load_config"]

DEFAULT_CONFIG_FILE = "config.json"

# Environment variable that points at the config file when no path is passed.
CONFIG_ENV_VAR = "RETAILID_CONFIG"

PathLike = Union[str, "os.PathLike[str]"]


@dataclass(frozen=True)
class RetailIdConfig:
    """Settings used to build a :class:`~retailid.api.RetailIdClient`."""

    vendor_api_key: str
    user_api_key: str
    state_code: str | None = None
    base_url: str | None = None
    timeout: float = 30.0
    max_retries: int = 3
    backoff_base: float = 1.0

    def __repr__(self) -> str:
        # Never expose keys.
        return (
            f"RetailIdConfig(state_code={self.state_code!r}, base_url={self.base_url!r}, "
            f"timeout={self.timeout!r}, max_retries={self.max_retries!r})"
        )

    @classmethod
    def from_mapping(cls, data: Mapping[str, Any]) -> RetailIdConfig:
        missing = [k for k in ("vendor_api_key", "user_api_key") if not data.get(k)]
        if missing:
            raise RetailIdConfigError(f"Config is missing required keys: {', '.join(missing)}")
        if not data.get("state_code") and not data.get("base_url"):
            raise RetailIdConfigError("Config must set either state_code or base_url")
        return cls(
            vendor_api_key=str(data["vendor_api_key"]),
            user_api_key=str(data["user_api_key"]),
            state_code=data.get("state_code") or None,
            base_url=data.get("base_url") or None,
            timeout=float(data.get("timeout", 30.0)),
            max_retries=int(data.get("max_retries", 3)),
            backoff_base=float(data.get("backoff_base", 1.0)),
        )


def load_config(path: PathLike | None = None) -> RetailIdConfig:
    """
    Read a config file.

    Args:
        path: File to read. Defaults to ``$RETAILID_CONFIG`` if set, otherwise
            ``config.json`` in the current working directory.

    Raises:
        RetailIdConfigError: if the file is missing, is not valid JSON, or
            lacks the keys or location.
    """
    if path is None:
        path = os.environ.get(CONFIG_ENV_VAR) or DEFAULT_CONFIG_FILE
    file = Path(path)
    try:
        data = json.loads(file.read_text(encoding="utf-8"))
    except FileNotFoundError as e:
        raise RetailIdConfigError(f"Config file not found: {file}") from e
    except ValueError as e:
        raise RetailIdConfigError(f"Config file is not valid JSON: {file}: {e}") from e
    if not isinstance(data, Mapping):
        raise RetailIdConfigError(f"Config file must contain a JSON object: {file}")
    return RetailIdConfig.from_mapping(data)
