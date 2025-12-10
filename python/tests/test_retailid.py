# Copyright 2025 Metrc, LLC
# SPDX-License-Identifier: MIT
"""Tests for the RetailID SDK, matching the JavaScript SDK test suite."""

import pytest

from retailid import (
    ObjectId,
    VarInt,
    RetailIdPair,
    RetailId,
    encode_base36,
    decode_base36,
    test_base36,
    encode_url64,
    decode_url64,
    get_short_url,
)


class TestObjectId:
    """Tests for ObjectId class."""

    def test_create_from_hex_string(self):
        oid = ObjectId("1a4060300020081000006609")
        assert oid.to_hex_string() == "1a4060300020081000006609"

    def test_create_from_bytes(self):
        data = bytes.fromhex("1a4060300020081000006609")
        oid = ObjectId(data)
        assert oid.to_hex_string() == "1a4060300020081000006609"

    def test_create_random(self):
        oid = ObjectId()
        assert len(oid.id) == 12
        assert len(oid.to_hex_string()) == 24

    def test_invalid_hex_length(self):
        with pytest.raises(ValueError, match="Invalid ObjectId hex string"):
            ObjectId("1a4060")

    def test_invalid_hex_chars(self):
        with pytest.raises(ValueError, match="Invalid ObjectId hex string"):
            ObjectId("1a4060300020081000006xyz")

    def test_invalid_bytes_length(self):
        with pytest.raises(ValueError, match="Invalid ObjectId bytes length"):
            ObjectId(b"\x00" * 10)

    def test_equals(self):
        oid1 = ObjectId("1a4060300020081000006609")
        oid2 = ObjectId("1a4060300020081000006609")
        oid3 = ObjectId("1a4060300020081000006610")

        assert oid1 == oid2
        assert oid1.equals(oid2)
        assert oid1 != oid3
        assert not oid1.equals(oid3)

    def test_equals_with_bytes(self):
        oid = ObjectId("1a4060300020081000006609")
        data = bytes.fromhex("1a4060300020081000006609")
        assert oid.equals(data)


class TestVarInt:
    """Tests for VarInt encoding/decoding."""

    def test_encode_decode_small_values(self):
        """Values < 128 should use 1 byte."""
        encoded = VarInt.encode(1)
        assert len(encoded) == 1
        decoded = VarInt.decode(encoded)
        assert decoded["value"] == 1

    def test_encode_decode_128(self):
        """Values >= 128 should use 2 bytes."""
        encoded = VarInt.encode(128)
        assert len(encoded) == 2
        decoded = VarInt.decode(encoded)
        assert decoded["value"] == 128

    def test_encode_decode_16384(self):
        """Values >= 16384 should use 3 bytes."""
        encoded = VarInt.encode(16384)
        assert len(encoded) == 3
        decoded = VarInt.decode(encoded)
        assert decoded["value"] == 16384

    def test_varint_class(self):
        vi = VarInt(128)
        assert vi.value == 128
        assert len(vi) == 2

    def test_varint_from_bytes(self):
        encoded = VarInt.encode(16384)
        vi = VarInt(encoded)
        assert vi.value == 16384


class TestBase36:
    """Tests for Base36 encoding/decoding."""

    def test_encode_decode_roundtrip(self):
        original = bytes.fromhex("1a4060300020081000006609")
        encoded = encode_base36(original)
        decoded = decode_base36(encoded)
        # The decoded may have different length due to leading zeros
        assert decoded == original or decoded.lstrip(b"\x00") == original.lstrip(b"\x00")

    def test_test_base36(self):
        assert test_base36("ABC123")
        assert test_base36("abc123")
        assert not test_base36("ABC+123")
        assert not test_base36("")


class TestUrl64:
    """Tests for URL-safe Base64 encoding/decoding."""

    def test_decode_url64(self):
        # URL-safe to standard base64
        assert decode_url64("abc-def_ghi") == "abc+def/ghi="

    def test_encode_url64(self):
        # Standard to URL-safe base64
        assert encode_url64("abc+def/ghi=") == "abc-def_ghi"


# Test cases matching JavaScript SDK
TEST_CASES = [
    {
        "url": "HTTPS://1A4.COM/5LN8CBN1UB33DON9CHKX",
        "expected_batch_id": "1a4060300020081000006609",
        "expected_index": 1,
        "description": "index 1 (36 chars)",
    },
    {
        "url": "HTTPS://1A4.COM/13TX7BMRX3IU01B9EGTPTT",
        "expected_batch_id": "1a4060300020081000006609",
        "expected_index": 128,
        "description": "index 128 (38 chars)",
    },
    {
        "url": "HTTPS://1A4.COM/7V8S42PYJD1XC9C2UVNCD1D",
        "expected_batch_id": "1a4060300020081000006609",
        "expected_index": 16384,
        "description": "index 16384 (39 chars)",
    },
]


class TestDecoding:
    """Tests for URL decoding."""

    @pytest.mark.parametrize("case", TEST_CASES, ids=lambda c: c["description"])
    def test_decode_url(self, case):
        pair = RetailIdPair(case["url"])
        assert pair.batch_id.to_hex_string().lower() == case["expected_batch_id"].lower()
        assert pair.index == case["expected_index"]

    def test_decode_legacy_base64_url(self):
        url = "https://1a4.com/GkBgMAAEG2AAAJKXEQ"
        pair = RetailIdPair(url)
        assert pair.batch_id.to_hex_string().lower() == "1a40603000041b6000009297"
        assert pair.index == 17


class TestRoundTrip:
    """Tests for encoding/decoding round-trips."""

    @pytest.mark.parametrize("case", TEST_CASES, ids=lambda c: c["description"])
    def test_roundtrip(self, case):
        # Decode
        pair = RetailIdPair(case["url"])

        # Re-encode
        encoded = pair.encode()

        # Decode again
        pair2 = RetailIdPair(encoded)

        assert pair2.batch_id.to_hex_string().lower() == case["expected_batch_id"].lower()
        assert pair2.index == case["expected_index"]

    def test_roundtrip_legacy_base64_via_base64(self):
        url = "https://1a4.com/GkBgMAAEG2AAAJKXEQ"
        pair = RetailIdPair(url)

        # Re-encode as base64
        encoded = pair.encode(base64=True)

        # Decode again
        pair2 = RetailIdPair(encoded)
        assert pair2.batch_id.to_hex_string().lower() == "1a40603000041b6000009297"
        assert pair2.index == 17

    def test_roundtrip_legacy_base64_via_base36(self):
        url = "https://1a4.com/GkBgMAAEG2AAAJKXEQ"
        pair = RetailIdPair(url)

        # Re-encode as base36 (default)
        encoded = pair.encode()

        # Should be uppercase base36
        assert encoded.startswith("HTTPS://1A4.COM/")
        assert encoded[16:].isalnum()
        assert encoded[16:].isupper()

        # Decode again
        pair2 = RetailIdPair(encoded)
        assert pair2.batch_id.to_hex_string().lower() == "1a40603000041b6000009297"
        assert pair2.index == 17


class TestDirectEncoding:
    """Tests for direct encoding with get_short_url."""

    def test_encode_objectid_and_index(self):
        batch_id = ObjectId("1a4060300020081000006609")
        url = get_short_url(batch_id, 1)

        # Should produce uppercase URL
        assert url.startswith("HTTPS://1A4.COM/")

        # Should decode back correctly
        pair = RetailIdPair(url)
        assert pair.batch_id.to_hex_string().lower() == "1a4060300020081000006609"
        assert pair.index == 1

    def test_base36_is_default(self):
        batch_id = ObjectId("1a4060300020081000006609")
        url = get_short_url(batch_id, 1)

        # Should be uppercase base36 format
        assert url.startswith("HTTPS://1A4.COM/")
        data_part = url.split("/")[-1]
        assert data_part.isalnum()
        assert data_part.isupper()

    def test_base64_when_requested(self):
        batch_id = ObjectId("1a4060300020081000006609")
        url = get_short_url(batch_id, 1, base64=True)

        # Should be lowercase https with URL-safe base64
        assert url.startswith("https://1a4.com/")
        data_part = url.split("/")[-1]
        # URL-safe base64 should not contain +, /, or =
        assert "+" not in data_part
        assert "/" not in data_part
        assert "=" not in data_part


class TestBackwardsCompatibility:
    """Tests for backwards compatibility with existing Python code."""

    def test_retail_id_encode_base36(self):
        tag = "1a406030003a14e000043614"
        index = 3
        expected = "HTTPS://1A4.COM/5LN8CBN28KHT5PLZ6QRN"

        encoded = RetailId.encode(tag, index, use_base64=False)
        assert encoded == expected

    def test_retail_id_encode_base64(self):
        tag = "1a406030003a14e000043614"
        index = 3
        expected = "https://1a4.com/GkBgMAA6FOAABDYUAw"

        encoded = RetailId.encode(tag, index, use_base64=True)
        assert encoded == expected

    def test_retail_id_decode(self):
        url = "HTTPS://1A4.COM/5LN8CBN28KHT5PLZ6QRN"
        pair = RetailId.decode(url)

        assert pair.tag == "1a406030003a14e000043614"
        assert pair.index == 3

    def test_retail_id_pair_tag_property(self):
        """Test that the .tag property works for backwards compatibility."""
        url = "HTTPS://1A4.COM/5LN8CBN1UB33DON9CHKX"
        pair = RetailIdPair(url)
        assert pair.tag == "1a4060300020081000006609"

    def test_retail_id_pair_batch_id_alias(self):
        """Test that .batchId works as an alias for .batch_id."""
        url = "HTTPS://1A4.COM/5LN8CBN1UB33DON9CHKX"
        pair = RetailIdPair(url)
        assert pair.batchId == pair.batch_id


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_invalid_url(self):
        with pytest.raises(ValueError, match="Unrecognized URL"):
            RetailIdPair("invalid_garbage")

    def test_empty_path(self):
        with pytest.raises(ValueError):
            RetailIdPair("https://1a4.com/")

    def test_shortcode_only(self):
        """Should handle just the shortcode without full URL."""
        pair = RetailIdPair("5LN8CBN1UB33DON9CHKX")
        assert pair.batch_id.to_hex_string().lower() == "1a4060300020081000006609"
        assert pair.index == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
