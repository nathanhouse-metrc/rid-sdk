# Copyright 2025 Metrc, LLC
# SPDX-License-Identifier: MIT
"""Tests for the Retail ID API client, using examples from the integration guide."""

import base64
import json
from urllib.parse import parse_qs, urlsplit

import pytest

from retailid import (
    Association,
    AuthenticationError,
    NotFoundError,
    RateLimitError,
    RetailIdClient,
    RetailIdTimeoutError,
    ServerError,
    UnprocessableError,
    short_code_from_url,
)
from retailid.api import HttpResponse

LICENSE = "837-XYZ"
LABEL = "1A4060300007777000000001"
SOURCE_LABEL = "1A4080300007747000000001"
QR_A = "https://1a4.com/ZScU6dsbUk98nsJEAA"
QR_B = "https://1a4.com/ZScU6dsbUk98nsJEAB"
QR_C = "https://1a4.com/ZScU6dsbUk98nsJEAC"


class FakeTransport:
    """Records requests and replays queued responses."""

    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []

    def __call__(self, method, url, headers, body, timeout):
        parts = urlsplit(url)
        self.calls.append(
            {
                "method": method,
                "path": parts.path,
                "query": {k: v[0] for k, v in parse_qs(parts.query).items()},
                "headers": dict(headers),
                "json": json.loads(body) if body else None,
            }
        )
        response = self.responses.pop(0)
        if isinstance(response, BaseException):
            raise response
        return response


def ok(payload, status=200, headers=None):
    body = b"" if payload is None else json.dumps(payload).encode()
    return HttpResponse(status, headers or {}, body)


def make_client(*responses, **kwargs):
    transport = FakeTransport(*responses)
    sleeps = []
    client = RetailIdClient(
        "vendor-key",
        "user-key",
        state_code="md",
        transport=transport,
        sleep=sleeps.append,
        **kwargs,
    )
    return client, transport, sleeps


class TestClientSetup:
    def test_base_url_from_state_code(self):
        client, _, _ = make_client()
        assert client.base_url == "https://api-md.metrc.com"

    def test_base_url_override(self):
        client = RetailIdClient("v", "u", base_url="https://sandbox-api-md.metrc.com/")
        assert client.base_url == "https://sandbox-api-md.metrc.com"

    def test_requires_keys_and_location(self):
        with pytest.raises(ValueError):
            RetailIdClient("", "u", state_code="md")
        with pytest.raises(ValueError):
            RetailIdClient("v", "u")

    def test_basic_auth_header_and_repr_hide_keys(self):
        client, transport, _ = make_client(ok([]))
        client.get_facilities()
        expected = base64.b64encode(b"vendor-key:user-key").decode()
        assert transport.calls[0]["headers"]["Authorization"] == f"Basic {expected}"
        assert "vendor-key" not in repr(client)
        assert "user-key" not in repr(client)


class TestLabelPrinting:
    def test_get_facilities(self):
        client, transport, _ = make_client(ok([{"License": {"Number": LICENSE}}]))
        assert client.get_facilities() == [{"License": {"Number": LICENSE}}]
        assert transport.calls[0]["path"] == "/facilities/v2/"

    def test_get_allotment(self):
        client, transport, _ = make_client(
            ok([{"FacilityId": 1234, "FacilityLicenseNumber": LICENSE, "Allotment": 5000}])
        )
        [allotment] = client.get_allotment(LICENSE)
        assert allotment.facility_id == 1234
        assert allotment.facility_license_number == LICENSE
        assert allotment.allotment == 5000
        call = transport.calls[0]
        assert call["method"] == "GET"
        assert call["path"] == "/retailid/v2/allotment"
        assert call["query"] == {"licenseNumber": LICENSE}

    def test_generate(self):
        client, transport, _ = make_client(ok({"IssuanceId": "661d835f5f6fac1d7ee1f347"}))
        result = client.generate(LICENSE, LABEL, 3)
        assert result.issuance_id == "661d835f5f6fac1d7ee1f347"
        call = transport.calls[0]
        assert call["method"] == "POST"
        assert call["path"] == "/retailid/v2/generate"
        assert call["query"] == {"licenseNumber": LICENSE}
        assert call["json"] == {"PackageLabel": LABEL, "Quantity": 3}
        assert call["headers"]["Content-Type"] == "application/json"

    def test_generate_rejects_bad_quantity(self):
        client, _, _ = make_client()
        with pytest.raises(ValueError):
            client.generate(LICENSE, LABEL, 0)

    def test_packages_info(self):
        client, transport, _ = make_client(
            ok(
                [
                    {
                        "PackageLabel": LABEL,
                        "QrCount": 3,
                        "HasQrs": True,
                        "Issuances": [
                            {"LabelSet": 1, "LabelQuantity": 3, "CreatedAt": "2026-10-21T00:00:00Z"}
                        ],
                        "SiblingCount": 0,
                        "RequiresVerification": False,
                        "EstimatedBalance": 3,
                    }
                ]
            )
        )
        [info] = client.get_packages_info(LICENSE, [LABEL])
        assert info.package_label == LABEL
        assert info.qr_count == 3
        assert info.has_qrs is True
        assert info.issuances[0].label_set == 1
        assert info.issuances[0].label_quantity == 3
        assert info.requires_verification is False
        assert info.estimated_balance == 3
        assert transport.calls[0]["json"] == {"packageLabels": [LABEL]}

    def test_packages_info_chunks_by_ten(self):
        labels = [f"1A40603000077770000000{i:02d}" for i in range(23)]
        client, transport, _ = make_client(ok([]), ok([]), ok([]))
        client.get_packages_info(LICENSE, labels)
        sizes = [len(c["json"]["packageLabels"]) for c in transport.calls]
        assert sizes == [10, 10, 3]

    def test_packages_info_retries_server_error(self):
        client, transport, sleeps = make_client(ok({"Message": "boom"}, status=503), ok([]))
        assert client.get_packages_info(LICENSE, [LABEL]) == []
        assert len(transport.calls) == 2
        assert len(sleeps) == 1

    def test_available_tags_and_package(self):
        client, transport, _ = make_client(ok({"Data": [{"Label": LABEL}]}), ok({"Id": 1}))
        assert client.get_available_tags(LICENSE) == [{"Label": LABEL}]
        assert client.get_package(LICENSE, LABEL) == {"Id": 1}
        assert transport.calls[0]["path"] == "/tags/v2/package/available"
        assert transport.calls[1]["path"] == f"/packages/v2/{LABEL}"


class TestReceiving:
    RECEIVE = {
        "Eaches": [QR_A, QR_B, QR_C],
        "SiblingTags": [LABEL],
        "RequiresVerification": False,
        "QrCount": 3,
        "SomeNewField": "ignored",
    }

    def test_receive(self):
        client, transport, _ = make_client(ok(self.RECEIVE))
        result = client.receive(LICENSE, LABEL)
        assert result.eaches == [QR_A, QR_B, QR_C]
        assert result.sibling_tags == [LABEL]
        assert result.requires_verification is False
        assert result.qr_count == 3
        assert result.raw["SomeNewField"] == "ignored"
        assert transport.calls[0]["path"] == f"/retailid/v2/receive/{LABEL}"

    @pytest.mark.parametrize("value", [QR_A, "ZScU6dsbUk98nsJEAA"])
    def test_receive_by_qr_sends_short_code(self, value):
        client, transport, _ = make_client(ok(self.RECEIVE))
        client.receive_by_qr(LICENSE, value)
        assert transport.calls[0]["path"] == "/retailid/v2/receive/qr/ZScU6dsbUk98nsJEAA"

    def test_short_code_from_url(self):
        assert short_code_from_url(QR_A) == "ZScU6dsbUk98nsJEAA"
        assert short_code_from_url("HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL") == (
            "10NOIEYKAJDG6CF0EXGJL"
        )
        assert short_code_from_url("ZScU6dsbUk98nsJEAA") == "ZScU6dsbUk98nsJEAA"
        with pytest.raises(ValueError):
            short_code_from_url("https://1a4.com/")

    def test_associate(self):
        client, transport, _ = make_client(ok({"Added": 2}))
        client.associate(LICENSE, [Association(LABEL, [QR_A, QR_B])])
        call = transport.calls[0]
        assert call["method"] == "POST"
        assert call["path"] == "/retailid/v2/associate"
        assert call["json"] == [{"PackageLabel": LABEL, "QrUrls": [QR_A, QR_B]}]

    def test_associate_package_and_dict_input(self):
        client, transport, _ = make_client(ok(None), ok(None))
        client.associate_package(LICENSE, LABEL, [QR_A])
        client.associate(LICENSE, [{"PackageLabel": LABEL, "QrUrls": [QR_A]}])
        assert transport.calls[0]["json"] == transport.calls[1]["json"]

    def test_associate_limits_batch_size(self):
        client, _, _ = make_client()
        with pytest.raises(ValueError, match="no more than 10"):
            client.associate(LICENSE, [Association(LABEL, [QR_A])] * 11)
        with pytest.raises(ValueError):
            client.associate(LICENSE, [])

    def test_merge_sends_target_first(self):
        client, transport, _ = make_client(ok({"Ids": [1], "Warnings": None}))
        assert client.merge(LICENSE, LABEL, SOURCE_LABEL) == {"Ids": [1], "Warnings": None}
        call = transport.calls[0]
        assert call["path"] == "/retailid/v2/merge"
        assert call["json"] == {"packageLabels": [LABEL, SOURCE_LABEL]}

    def test_merge_rejects_same_label(self):
        client, _, _ = make_client()
        with pytest.raises(ValueError):
            client.merge(LICENSE, LABEL, LABEL)

    def test_merge_rejection_is_not_retried(self):
        client, transport, _ = make_client(ok({"Message": "Lab results differ"}, status=422))
        with pytest.raises(UnprocessableError) as exc:
            client.merge(LICENSE, LABEL, SOURCE_LABEL)
        assert exc.value.message == "Lab results differ"
        assert len(transport.calls) == 1


class TestSales:
    RECEIPT = {
        "SalesDateTime": "2026-10-28T12:00:00",
        "Transactions": [{"PackageLabel": LABEL, "QrCodes": [QR_A, QR_B]}],
    }

    def test_post_sales_receipts(self):
        client, transport, _ = make_client(ok({"Ids": [42], "Warnings": None}))
        assert client.post_sales_receipts(LICENSE, [self.RECEIPT]) == {"Ids": [42], "Warnings": None}
        call = transport.calls[0]
        assert call["path"] == "/sales/v2/receipts"
        assert call["json"] == [self.RECEIPT]

    @pytest.mark.parametrize(
        "endpoint,path",
        [
            ("deliveries", "/sales/v2/deliveries"),
            ("deliveries_retailer", "/sales/v2/deliveries/retailer"),
            ("deliveries_retailer_sale", "/sales/v2/deliveries/retailer/sale"),
        ],
    )
    def test_post_sales_delivery_endpoints(self, endpoint, path):
        client, transport, _ = make_client(ok({"Ids": [1]}))
        client.post_sales(LICENSE, [self.RECEIPT], endpoint=endpoint)
        assert transport.calls[0]["path"] == path

    def test_unknown_sales_endpoint(self):
        client, _, _ = make_client()
        with pytest.raises(ValueError):
            client.post_sales(LICENSE, [self.RECEIPT], endpoint="nope")


class TestCatalog:
    def test_iter_global_products_follows_pages(self):
        client, transport, _ = make_client(
            ok({"Data": [{"Id": 1}, {"Id": 2}], "TotalPages": 2, "PageNumber": 1}),
            ok({"Data": [{"Id": 3}], "TotalPages": 2, "PageNumber": 2}),
        )
        products = client.get_global_products(77, page_size=2)
        assert [p["Id"] for p in products] == [1, 2, 3]
        assert transport.calls[0]["query"] == {"brandId": "77", "pageNumber": "1", "pageSize": "2"}
        assert transport.calls[1]["query"]["pageNumber"] == "2"
        assert "licenseNumber" not in transport.calls[0]["query"]

    def test_get_global_product(self):
        client, transport, _ = make_client(ok({"Id": 5, "DisplayName": "Gummies"}))
        assert client.get_global_product(5)["DisplayName"] == "Gummies"
        assert transport.calls[0]["path"] == "/globalproducts/v2/5"


class TestErrorsAndRetries:
    def test_status_maps_to_error_class(self):
        client, _, _ = make_client(ok({"Message": "bad keys"}, status=401))
        with pytest.raises(AuthenticationError) as exc:
            client.get_facilities()
        assert exc.value.status_code == 401
        assert "vendor-key" not in str(exc.value)

    def test_not_found(self):
        client, _, _ = make_client(ok([{"message": "Package not found"}], status=404))
        with pytest.raises(NotFoundError, match="Package not found"):
            client.receive(LICENSE, LABEL)

    def test_429_waits_retry_after(self):
        client, transport, sleeps = make_client(
            ok(None, status=429, headers={"Retry-After": "7"}),
            ok({"IssuanceId": "abc"}),
        )
        assert client.generate(LICENSE, LABEL, 1).issuance_id == "abc"
        assert sleeps == [7.0]
        assert len(transport.calls) == 2

    def test_429_without_header_backs_off_increasingly(self):
        client, _, sleeps = make_client(
            ok(None, status=429), ok(None, status=429), ok([]), backoff_base=1.0
        )
        client.get_facilities()
        assert len(sleeps) == 2
        assert 1.0 <= sleeps[0] < 1.5
        assert 2.0 <= sleeps[1] < 2.5

    def test_429_gives_up_after_max_retries(self):
        client, transport, _ = make_client(
            *[ok(None, status=429) for _ in range(3)], max_retries=2
        )
        with pytest.raises(RateLimitError):
            client.get_facilities()
        assert len(transport.calls) == 3

    def test_get_retries_server_error(self):
        client, transport, _ = make_client(ok(None, status=502), ok({"Eaches": []}))
        client.receive(LICENSE, LABEL)
        assert len(transport.calls) == 2

    def test_write_does_not_retry_server_error(self):
        client, transport, _ = make_client(ok(None, status=500))
        with pytest.raises(ServerError):
            client.generate(LICENSE, LABEL, 1)
        assert len(transport.calls) == 1

    def test_write_timeout_is_not_retried(self):
        client, transport, _ = make_client(TimeoutError("timed out"))
        with pytest.raises(RetailIdTimeoutError) as exc:
            client.generate(LICENSE, LABEL, 1)
        assert exc.value.method == "POST"
        assert len(transport.calls) == 1

    def test_read_timeout_is_retried(self):
        client, transport, _ = make_client(TimeoutError("timed out"), ok({"Eaches": [QR_A]}))
        assert client.receive(LICENSE, LABEL).eaches == [QR_A]
        assert len(transport.calls) == 2
