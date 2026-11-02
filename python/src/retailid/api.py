# Copyright 2025 Metrc, LLC
# SPDX-License-Identifier: MIT
"""
Client for the Metrc Retail ID API.

Wraps the endpoints described in the Retail ID API Integration Guide:

* Label printing: allotment, generate, packages/info, receive
* Receiving: receive (by package label or QR short code), associate, merge
* Point of sale: sales receipts and delivery endpoints carrying ``QrCodes``
* Catalog: global products

Every request is authenticated with HTTP Basic auth using the vendor API key
as the username and the user API key as the password. Keys are never logged.

HTTP is handled by `requests <https://requests.readthedocs.io/>`_. Errors live
in :mod:`retailid.errors`; credentials can be loaded from ``config.json`` with
:meth:`RetailIdClient.from_config`.
"""

from __future__ import annotations

import logging
import random
import time
import urllib.parse
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any, Callable

import requests
from requests.auth import HTTPBasicAuth

from .config import PathLike, RetailIdConfig, load_config
from .errors import (
    AuthenticationError,
    BadRequestError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
    RateLimitError,
    RetailIdApiError,
    RetailIdTimeoutError,
    ServerError,
    UnprocessableError,
    error_for_status,
)

__all__ = [
    "MAX_RECORDS_PER_REQUEST",
    "SALES_ENDPOINTS",
    "Allotment",
    "Association",
    "GenerateResult",
    "Issuance",
    "PackageInfo",
    "ReceiveResult",
    "RetailIdClient",
    "short_code_from_url",
    # Re-exported from retailid.errors for convenience.
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
]

logger = logging.getLogger("retailid.api")

# Section 10: "When a request takes a list of records, send no more than 10 per request."
MAX_RECORDS_PER_REQUEST = 10

# Section 8: sales endpoints that accept Retail IDs in ``Transactions[].QrCodes``.
SALES_ENDPOINTS: Mapping[str, str] = {
    "receipts": "/sales/v2/receipts",
    "deliveries": "/sales/v2/deliveries",
    "deliveries_retailer": "/sales/v2/deliveries/retailer",
    "deliveries_retailer_sale": "/sales/v2/deliveries/retailer/sale",
}

JsonValue = Any


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Allotment:
    """A New York facility's remaining Retail Item ID allotment."""

    facility_id: int | None
    facility_license_number: str | None
    allotment: int
    raw: Mapping[str, JsonValue] = field(repr=False, default_factory=dict)

    @classmethod
    def from_json(cls, data: Mapping[str, JsonValue]) -> Allotment:
        return cls(
            facility_id=data.get("FacilityId"),
            facility_license_number=data.get("FacilityLicenseNumber"),
            allotment=int(data.get("Allotment") or 0),
            raw=data,
        )


@dataclass(frozen=True)
class GenerateResult:
    """Result of one Generate run (an issuance)."""

    issuance_id: str
    raw: Mapping[str, JsonValue] = field(repr=False, default_factory=dict)

    @classmethod
    def from_json(cls, data: Mapping[str, JsonValue]) -> GenerateResult:
        return cls(issuance_id=str(data.get("IssuanceId", "")), raw=data)


@dataclass(frozen=True)
class Issuance:
    """One Generate run recorded against a package."""

    label_set: int | None
    label_quantity: int | None
    created_at: str | None
    raw: Mapping[str, JsonValue] = field(repr=False, default_factory=dict)

    @classmethod
    def from_json(cls, data: Mapping[str, JsonValue]) -> Issuance:
        return cls(
            label_set=data.get("LabelSet"),
            label_quantity=data.get("LabelQuantity"),
            created_at=data.get("CreatedAt"),
            raw=data,
        )


@dataclass(frozen=True)
class PackageInfo:
    """Retail ID details for a package, as returned by ``packages/info``."""

    package_label: str | None
    qr_count: int
    has_qrs: bool
    issuances: list[Issuance]
    sibling_count: int | None
    requires_verification: bool
    estimated_balance: int | None
    raw: Mapping[str, JsonValue] = field(repr=False, default_factory=dict)

    @classmethod
    def from_json(cls, data: Mapping[str, JsonValue]) -> PackageInfo:
        return cls(
            package_label=data.get("PackageLabel") or data.get("Label"),
            qr_count=int(data.get("QrCount") or 0),
            has_qrs=bool(data.get("HasQrs")),
            issuances=[Issuance.from_json(i) for i in data.get("Issuances") or []],
            sibling_count=data.get("SiblingCount"),
            requires_verification=bool(data.get("RequiresVerification")),
            estimated_balance=data.get("EstimatedBalance"),
            raw=data,
        )


@dataclass(frozen=True)
class ReceiveResult:
    """A package's QR URLs and receiving status."""

    eaches: list[str]
    sibling_tags: list[str]
    requires_verification: bool
    child_tag: str | None = None
    label_source: str | None = None
    qr_count: int | None = None
    ranges: JsonValue | None = None
    raw: Mapping[str, JsonValue] = field(repr=False, default_factory=dict)

    @classmethod
    def from_json(cls, data: Mapping[str, JsonValue]) -> ReceiveResult:
        return cls(
            eaches=list(data.get("Eaches") or []),
            sibling_tags=list(data.get("SiblingTags") or []),
            requires_verification=bool(data.get("RequiresVerification")),
            child_tag=data.get("ChildTag"),
            label_source=data.get("LabelSource"),
            qr_count=data.get("QrCount"),
            ranges=data.get("Ranges"),
            raw=data,
        )


@dataclass(frozen=True)
class Association:
    """One entry of a Scan and Associate request: a package and the units in it."""

    package_label: str
    qr_urls: Sequence[str]

    def to_json(self) -> dict[str, JsonValue]:
        return {"PackageLabel": self.package_label, "QrUrls": list(self.qr_urls)}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def short_code_from_url(qr_url_or_code: str) -> str:
    """
    Return the short code from a scanned QR URL.

    ``https://1a4.com/ZScU6dsbUk98nsJEAA`` -> ``ZScU6dsbUk98nsJEAA``. A value that
    is already a short code is returned unchanged.
    """
    value = qr_url_or_code.strip()
    if "://" in value:
        value = urllib.parse.urlsplit(value).path
    code = value.strip("/").rsplit("/", 1)[-1]
    if not code:
        raise ValueError(f"No short code found in {qr_url_or_code!r}")
    return code


def _check_batch(name: str, items: Sequence[Any]) -> None:
    if not items:
        raise ValueError(f"{name} must not be empty")
    if len(items) > MAX_RECORDS_PER_REQUEST:
        raise ValueError(
            f"{name} has {len(items)} records; send no more than "
            f"{MAX_RECORDS_PER_REQUEST} per request"
        )


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------


class RetailIdClient:
    """
    Client for the Metrc Retail ID API.

    Example::

        client = RetailIdClient.from_config("config.json")
        # or: RetailIdClient(vendor_key, user_key, state_code="md")
        result = client.generate("837-XYZ", "1A4060300007777000000001", quantity=3)
        received = client.receive("837-XYZ", "1A4060300007777000000001")
        for url in received.eaches:
            print_label(url)

    Retries: 429 responses are always retried (honoring ``Retry-After``); 5xx
    responses are retried only for GET/read calls. Calls that change data are
    never retried after a timeout or server error, because they may already
    have been applied (section 10 of the guide).

    The client keeps a :class:`requests.Session` for connection reuse. Use it
    as a context manager, or call :meth:`close`, to release connections.
    """

    def __init__(
        self,
        vendor_api_key: str,
        user_api_key: str,
        *,
        state_code: str | None = None,
        base_url: str | None = None,
        timeout: float = 30.0,
        max_retries: int = 3,
        backoff_base: float = 1.0,
        session: requests.Session | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ):
        """
        Args:
            vendor_api_key: Vendor (software) API key.
            user_api_key: API key for the Metrc user making requests.
            state_code: Market code, e.g. ``"md"`` -> ``https://api-md.metrc.com``.
            base_url: Full base URL; overrides ``state_code`` (use for the Sandbox).
            timeout: Per-request timeout in seconds.
            max_retries: Maximum retries for retryable responses.
            backoff_base: Base delay in seconds when no ``Retry-After`` is sent.
            session: Optional ``requests.Session`` (e.g. with proxies or custom
                adapters). It is not closed by :meth:`close`.
            sleep: Sleep function, mainly for testing.
        """
        if not vendor_api_key or not user_api_key:
            raise ValueError("Both vendor_api_key and user_api_key are required")
        if base_url is None:
            if not state_code:
                raise ValueError("Provide either state_code or base_url")
            base_url = f"https://api-{state_code.strip().lower()}.metrc.com"
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
        self.backoff_base = backoff_base
        self._owns_session = session is None
        self.session = session if session is not None else requests.Session()
        self._sleep = sleep
        self._auth = HTTPBasicAuth(vendor_api_key, user_api_key)

    @classmethod
    def from_config(
        cls,
        config: RetailIdConfig | PathLike | None = None,
        **kwargs: Any,
    ) -> RetailIdClient:
        """
        Build a client from a ``config.json`` path or a :class:`RetailIdConfig`.

        With no argument, reads ``$RETAILID_CONFIG`` or ``./config.json``.
        Extra keyword arguments (``session``, ``timeout``, ...) are passed to
        the constructor and override values from the file.

        Raises:
            RetailIdConfigError: if the file is missing or incomplete.
        """
        if not isinstance(config, RetailIdConfig):
            config = load_config(config)
        options: dict[str, Any] = {
            "state_code": config.state_code,
            "base_url": config.base_url,
            "timeout": config.timeout,
            "max_retries": config.max_retries,
            "backoff_base": config.backoff_base,
        }
        options.update(kwargs)
        return cls(config.vendor_api_key, config.user_api_key, **options)

    def __repr__(self) -> str:
        # Never expose keys.
        return f"RetailIdClient(base_url={self.base_url!r})"

    def close(self) -> None:
        """Close the underlying session if the client created it."""
        if self._owns_session:
            self.session.close()

    def __enter__(self) -> RetailIdClient:
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()

    # -- low-level ---------------------------------------------------------

    def request(
        self,
        method: str,
        path: str,
        *,
        license_number: str | None = None,
        params: Mapping[str, Any] | None = None,
        json_body: JsonValue = None,
        idempotent: bool | None = None,
    ) -> JsonValue:
        """
        Send a request and return the decoded JSON body (or ``None`` if empty).

        ``idempotent`` marks a call as read-only so timeouts and 5xx responses
        may be retried. It defaults to ``True`` for GET and ``False`` otherwise.

        Raises:
            RetailIdApiError: (or a subclass) for non-2xx responses.
            RetailIdTimeoutError: if the request timed out.
        """
        method = method.upper()
        if idempotent is None:
            idempotent = method == "GET"
        query: dict[str, Any] = {}
        if license_number is not None:
            query["licenseNumber"] = license_number
        if params:
            query.update({k: v for k, v in params.items() if v is not None})
        url = self.base_url + path

        attempt = 0
        while True:
            started = time.monotonic()
            try:
                response = self.session.request(
                    method,
                    url,
                    params=query or None,
                    json=json_body,
                    headers={"Accept": "application/json"},
                    auth=self._auth,
                    timeout=self.timeout,
                )
            except requests.Timeout as e:
                logger.warning(
                    "%s %s license=%s timed out after %.2fs",
                    method, path, license_number, time.monotonic() - started,
                )
                if idempotent and attempt < self.max_retries:
                    attempt += 1
                    self._sleep(self._backoff(attempt))
                    continue
                raise RetailIdTimeoutError(method, path, e) from e

            logger.debug(
                "%s %s license=%s -> %d in %.2fs",
                method, path, license_number, response.status_code, time.monotonic() - started,
            )
            if 200 <= response.status_code < 300:
                return self._decode(response)

            error = error_for_status(
                response.status_code,
                self._decode(response),
                response.headers,
                method=method,
                path=path,
            )
            retryable = error.status_code == 429 or (error.status_code >= 500 and idempotent)
            if retryable and attempt < self.max_retries:
                attempt += 1
                delay = (
                    error.retry_after
                    if isinstance(error, RateLimitError) and error.retry_after is not None
                    else self._backoff(attempt)
                )
                logger.info(
                    "%s %s -> %d, retrying in %.2fs (attempt %d/%d)",
                    method, path, response.status_code, delay, attempt, self.max_retries,
                )
                self._sleep(delay)
                continue
            raise error

    def _backoff(self, attempt: int) -> float:
        # "wait a little longer after each attempt"
        return float(self.backoff_base * (2 ** (attempt - 1)) + random.uniform(0, 0.25))

    @staticmethod
    def _decode(response: requests.Response) -> JsonValue:
        body = response.content
        if not body or not body.strip():
            return None
        try:
            return response.json()
        except ValueError:
            return body.decode("utf-8", errors="replace")

    def _paged(
        self,
        path: str,
        *,
        license_number: str | None = None,
        params: Mapping[str, Any] | None = None,
        page_size: int | None = None,
    ) -> Iterator[JsonValue]:
        """Yield every record of a paged v2 list, requesting each page in turn."""
        page = 1
        while True:
            query = dict(params or {})
            query["pageNumber"] = page
            if page_size is not None:
                query["pageSize"] = page_size
            data = self.request("GET", path, license_number=license_number, params=query)
            if isinstance(data, list):
                # Unpaged response.
                yield from data
                return
            if not isinstance(data, Mapping):
                return
            records = data.get("Data") or []
            yield from records
            total_pages = data.get("TotalPages")
            if not records or total_pages is None or page >= int(total_pages):
                return
            page += 1

    # -- access check (section 2) ------------------------------------------

    def get_facilities(self) -> list[JsonValue]:
        """``GET /facilities/v2/`` — confirms the keys work and lists visible facilities."""
        data = self.request("GET", "/facilities/v2/")
        if isinstance(data, Mapping):
            return list(data.get("Data") or [])
        return list(data or [])

    # -- label printing (section 4) ----------------------------------------

    def get_allotment(self, license_number: str) -> list[Allotment]:
        """``GET /retailid/v2/allotment`` — remaining Retail Item IDs (New York only)."""
        data = self.request("GET", "/retailid/v2/allotment", license_number=license_number)
        if isinstance(data, Mapping):
            data = [data]
        return [Allotment.from_json(d) for d in data or []]

    def generate(self, license_number: str, package_label: str, quantity: int) -> GenerateResult:
        """
        ``POST /retailid/v2/generate`` — create Retail IDs for a package.

        Changes data and is not retried on timeout. If this raises
        :class:`RetailIdTimeoutError`, call :meth:`get_packages_info` to check
        whether the issuance was created before trying again.
        """
        if quantity < 1:
            raise ValueError("quantity must be at least 1")
        data = self.request(
            "POST",
            "/retailid/v2/generate",
            license_number=license_number,
            json_body={"PackageLabel": package_label, "Quantity": quantity},
        )
        return GenerateResult.from_json(data or {})

    def get_packages_info(
        self, license_number: str, package_labels: Sequence[str]
    ) -> list[PackageInfo]:
        """
        ``POST /retailid/v2/packages/info`` — Retail ID details for packages.

        Read-only. Labels are sent in batches of at most
        :data:`MAX_RECORDS_PER_REQUEST`.
        """
        if isinstance(package_labels, str):
            package_labels = [package_labels]
        if not package_labels:
            raise ValueError("package_labels must not be empty")
        results: list[PackageInfo] = []
        for start in range(0, len(package_labels), MAX_RECORDS_PER_REQUEST):
            chunk = list(package_labels[start : start + MAX_RECORDS_PER_REQUEST])
            data = self.request(
                "POST",
                "/retailid/v2/packages/info",
                license_number=license_number,
                json_body={"packageLabels": chunk},
                idempotent=True,
            )
            if isinstance(data, Mapping):
                data = data.get("Data", [data])
            results.extend(PackageInfo.from_json(d) for d in data or [])
        return results

    def get_package_info(self, license_number: str, package_label: str) -> PackageInfo | None:
        """Convenience wrapper around :meth:`get_packages_info` for one package."""
        infos = self.get_packages_info(license_number, [package_label])
        return infos[0] if infos else None

    def get_available_tags(self, license_number: str) -> list[JsonValue]:
        """``GET /tags/v2/package/available`` — unused tags for staging labels."""
        data = self.request("GET", "/tags/v2/package/available", license_number=license_number)
        if isinstance(data, Mapping):
            return list(data.get("Data") or [])
        return list(data or [])

    def get_package(self, license_number: str, id_or_label: int | str) -> JsonValue:
        """``GET /packages/v2/{id}`` or ``/packages/v2/{label}`` (includes ``ProductLabel``)."""
        segment = urllib.parse.quote(str(id_or_label), safe="")
        return self.request("GET", f"/packages/v2/{segment}", license_number=license_number)

    # -- receiving (sections 5-7) ------------------------------------------

    def receive(self, license_number: str, package_label: str) -> ReceiveResult:
        """``GET /retailid/v2/receive/{label}`` — QR URLs and receiving status."""
        segment = urllib.parse.quote(package_label, safe="")
        data = self.request(
            "GET", f"/retailid/v2/receive/{segment}", license_number=license_number
        )
        return ReceiveResult.from_json(data or {})

    def receive_by_qr(self, license_number: str, qr_url_or_short_code: str) -> ReceiveResult:
        """
        ``GET /retailid/v2/receive/qr/{shortCode}`` — receive starting from one scanned unit.

        Accepts either the full scanned QR URL or the short code; only the short
        code is sent.
        """
        code = urllib.parse.quote(short_code_from_url(qr_url_or_short_code), safe="")
        data = self.request(
            "GET", f"/retailid/v2/receive/qr/{code}", license_number=license_number
        )
        return ReceiveResult.from_json(data or {})

    def associate(
        self,
        license_number: str,
        associations: Sequence[Association | Mapping[str, JsonValue]],
    ) -> JsonValue:
        """
        ``POST /retailid/v2/associate`` — Scan and Associate units with packages.

        Each entry is a package label and the full QR URLs (not short codes) of
        the units physically in it. At most :data:`MAX_RECORDS_PER_REQUEST`
        entries per call. Changes data and is not retried on timeout; call
        :meth:`receive` afterwards to confirm the result.

        Returns the raw response (the format can vary by market).
        """
        _check_batch("associations", associations)
        body = [a.to_json() if isinstance(a, Association) else dict(a) for a in associations]
        return self.request(
            "POST", "/retailid/v2/associate", license_number=license_number, json_body=body
        )

    def associate_package(
        self, license_number: str, package_label: str, qr_urls: Sequence[str]
    ) -> JsonValue:
        """Convenience wrapper: associate ``qr_urls`` with one package."""
        return self.associate(license_number, [Association(package_label, qr_urls)])

    def merge(
        self, license_number: str, target_package_label: str, source_package_label: str
    ) -> JsonValue:
        """
        ``POST /retailid/v2/merge`` — Package Merge.

        The target (first) keeps and receives all Retail ID links; the source
        (second) gives its links up. A rejection (e.g. different original
        package, lab results, or item) is raised as an API error and should not
        be resent unchanged. Not retried on timeout; check both packages first.

        Returns the raw response, typically ``{"Ids": [...], "Warnings": ...}``.
        """
        if target_package_label == source_package_label:
            raise ValueError("Target and source package labels must differ")
        return self.request(
            "POST",
            "/retailid/v2/merge",
            license_number=license_number,
            json_body={"packageLabels": [target_package_label, source_package_label]},
        )

    # -- point of sale (section 8) -----------------------------------------

    def post_sales(
        self,
        license_number: str,
        records: Sequence[Mapping[str, JsonValue]],
        *,
        endpoint: str = "receipts",
    ) -> JsonValue:
        """
        Report sales that include Retail IDs.

        ``records`` are full sales objects built from the market's Sales
        documentation; Retail IDs go in ``Transactions[].QrCodes`` alongside
        ``PackageLabel``. ``endpoint`` is one of :data:`SALES_ENDPOINTS`
        (``receipts``, ``deliveries``, ``deliveries_retailer``,
        ``deliveries_retailer_sale``). Not retried on timeout.
        """
        if endpoint not in SALES_ENDPOINTS:
            raise ValueError(
                f"Unknown sales endpoint {endpoint!r}; expected one of {sorted(SALES_ENDPOINTS)}"
            )
        _check_batch("records", records)
        return self.request(
            "POST",
            SALES_ENDPOINTS[endpoint],
            license_number=license_number,
            json_body=[dict(r) for r in records],
        )

    def post_sales_receipts(
        self, license_number: str, receipts: Sequence[Mapping[str, JsonValue]]
    ) -> JsonValue:
        """``POST /sales/v2/receipts``."""
        return self.post_sales(license_number, receipts, endpoint="receipts")

    # -- catalog (section 9) -----------------------------------------------

    def iter_global_products(
        self, brand_id: int | str, *, page_size: int | None = None
    ) -> Iterator[JsonValue]:
        """``GET /globalproducts/v2?brandId=`` — yields every Global Product across all pages."""
        return self._paged(
            "/globalproducts/v2", params={"brandId": brand_id}, page_size=page_size
        )

    def get_global_products(
        self, brand_id: int | str, *, page_size: int | None = None
    ) -> list[JsonValue]:
        """All Global Products for a brand (every page)."""
        return list(self.iter_global_products(brand_id, page_size=page_size))

    def get_global_product(self, product_id: int | str) -> JsonValue:
        """``GET /globalproducts/v2/{id}`` — one Global Product."""
        segment = urllib.parse.quote(str(product_id), safe="")
        return self.request("GET", f"/globalproducts/v2/{segment}")
