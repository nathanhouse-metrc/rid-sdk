# Copyright 2025 Metrc, LLC
# SPDX-License-Identifier: MIT
"""
Errors raised by the Retail ID API client (section 11 of the integration guide).

Non-2xx responses become a :class:`RetailIdApiError` subclass chosen by status
code. Timeouts become :class:`RetailIdTimeoutError`.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

__all__ = [
    "RetailIdApiError",
    "BadRequestError",
    "AuthenticationError",
    "PermissionDeniedError",
    "NotFoundError",
    "ConflictError",
    "UnprocessableError",
    "RateLimitError",
    "ServerError",
    "RetailIdTimeoutError",
    "RetailIdConfigError",
    "error_for_status",
]


class RetailIdApiError(Exception):
    """Raised when the Retail ID API returns a non-success status code."""

    def __init__(
        self,
        status_code: int,
        message: str,
        *,
        method: str = "",
        path: str = "",
        body: Any = None,
    ):
        super().__init__(f"{status_code} {method} {path}: {message}".strip())
        self.status_code = status_code
        self.message = message
        self.method = method
        self.path = path
        self.body = body


class BadRequestError(RetailIdApiError):
    """400: something in the request is missing or invalid."""


class AuthenticationError(RetailIdApiError):
    """401: the API keys were not accepted."""


class PermissionDeniedError(RetailIdApiError):
    """403: the keys work but lack Retail ID / Catalog permission or facility access."""


class NotFoundError(RetailIdApiError):
    """404: the address, package, or code was not found."""


class ConflictError(RetailIdApiError):
    """409: the request conflicts with the current state."""


class UnprocessableError(RetailIdApiError):
    """422: a business rule blocked the request (e.g. a rejected Package Merge)."""


class RateLimitError(RetailIdApiError):
    """429: too many requests."""

    def __init__(self, *args: Any, retry_after: float | None = None, **kwargs: Any):
        super().__init__(*args, **kwargs)
        self.retry_after = retry_after


class ServerError(RetailIdApiError):
    """5xx: a problem on Metrc's side."""


class RetailIdTimeoutError(Exception):
    """
    Raised when a request times out before a reply.

    For calls that change data (generate, associate, merge, sales) the request
    may still have been applied. Check the current state (``get_packages_info``
    or ``receive``) before resending.
    """

    def __init__(self, method: str, path: str, cause: BaseException):
        super().__init__(f"{method} {path} timed out: {cause}")
        self.method = method
        self.path = path
        self.cause = cause


class RetailIdConfigError(ValueError):
    """Raised when a ``config.json`` file is missing, unreadable, or incomplete."""


_ERRORS_BY_STATUS: dict[int, type[RetailIdApiError]] = {
    400: BadRequestError,
    401: AuthenticationError,
    403: PermissionDeniedError,
    404: NotFoundError,
    409: ConflictError,
    422: UnprocessableError,
    429: RateLimitError,
}


def _message_from(payload: Any) -> str:
    message = ""
    if isinstance(payload, Mapping):
        message = str(payload.get("Message") or payload.get("message") or "")
    elif isinstance(payload, list) and payload and isinstance(payload[0], Mapping):
        message = "; ".join(str(p.get("message") or p.get("Message") or "") for p in payload)
    elif isinstance(payload, str):
        message = payload
    return message or "Request failed"


def _parse_retry_after(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        return None


def error_for_status(
    status: int,
    payload: Any,
    headers: Mapping[str, str],
    *,
    method: str = "",
    path: str = "",
) -> RetailIdApiError:
    """
    Build the error for a non-2xx response.

    ``payload`` is the decoded response body. ``headers`` should be
    case-insensitive (as ``requests`` provides) so ``Retry-After`` is found.
    """
    message = _message_from(payload)
    if status == 429:
        return RateLimitError(
            status,
            message,
            method=method,
            path=path,
            body=payload,
            retry_after=_parse_retry_after(headers.get("Retry-After")),
        )
    cls = _ERRORS_BY_STATUS.get(status)
    if cls is None:
        cls = ServerError if status >= 500 else RetailIdApiError
    return cls(status, message, method=method, path=path, body=payload)
