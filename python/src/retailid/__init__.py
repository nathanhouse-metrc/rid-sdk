# Copyright 2025 Metrc, LLC
# SPDX-License-Identifier: MIT
"""
RetailID SDK for Python

Decode and encode RetailID QR codes used for supply chain package tracking.
"""

from __future__ import annotations

import base64
import os
import re
import struct
from datetime import datetime
from typing import Optional, Union

__version__ = "0.10.0"
__all__ = [
    "ObjectId",
    "VarInt",
    "RetailIdPair",
    "encode_base36",
    "decode_base36",
    "test_base36",
    "encode_url64",
    "decode_url64",
    "get_short_url",
]

# Known RetailID prefixes
RETAILID_PREFIXES = ("1a4", "abc")

# Valid ObjectId timestamp range: 2012-01-01 to 2052-01-01
MIN_OBJECTID_TIMESTAMP = int(datetime(2012, 1, 1).timestamp())
MAX_OBJECTID_TIMESTAMP = int(datetime(2052, 1, 1).timestamp())


def _hex_to_bytes(hex_str: str) -> bytes:
    """Convert hex string to bytes."""
    return bytes.fromhex(hex_str)


def _bytes_to_hex(data: bytes) -> str:
    """Convert bytes to lowercase hex string."""
    return data.hex()


class ObjectId:
    """
    Minimal ObjectId implementation compatible with MongoDB ObjectIds.

    An ObjectId is a 12-byte identifier, typically represented as a 24-character
    hex string.
    """

    __slots__ = ("_bytes",)

    def __init__(self, input: Optional[Union[str, bytes, bytearray]] = None):
        """
        Create an ObjectId.

        Args:
            input: Either a 24-character hex string, 12-byte bytes/bytearray,
                   or None to generate a random ObjectId.

        Raises:
            ValueError: If input is invalid.
        """
        if input is None:
            # Generate new ObjectId (12 random bytes)
            self._bytes = os.urandom(12)
        elif isinstance(input, str):
            if len(input) != 24 or not re.match(r'^[0-9a-fA-F]+$', input):
                raise ValueError(f"Invalid ObjectId hex string: {input}")
            self._bytes = _hex_to_bytes(input)
        elif isinstance(input, (bytes, bytearray)):
            if len(input) != 12:
                raise ValueError(f"Invalid ObjectId bytes length: {len(input)}")
            self._bytes = bytes(input)
        else:
            raise ValueError("ObjectId must be a 24-char hex string or 12-byte bytes")

    @property
    def id(self) -> bytes:
        """Return the raw bytes of this ObjectId."""
        return self._bytes

    def to_hex_string(self) -> str:
        """Return the hex string representation (lowercase)."""
        return _bytes_to_hex(self._bytes)

    def __str__(self) -> str:
        return self.to_hex_string()

    def __repr__(self) -> str:
        return f"ObjectId('{self.to_hex_string()}')"

    def __eq__(self, other: object) -> bool:
        if isinstance(other, ObjectId):
            return self._bytes == other._bytes
        if isinstance(other, (bytes, bytearray)):
            return self._bytes == bytes(other)
        return False

    def __hash__(self) -> int:
        return hash(self._bytes)

    def equals(self, other: Union[ObjectId, bytes, bytearray]) -> bool:
        """Check equality with another ObjectId or bytes."""
        return self == other


class VarInt:
    """
    Variable-length integer encoding (LEB128 unsigned).

    Small values use fewer bytes:
    - 0-127: 1 byte
    - 128-16383: 2 bytes
    - 16384-2097151: 3 bytes
    - etc.
    """

    __slots__ = ("_bytes", "value")

    def __init__(self, source: Union[bytes, bytearray, int]):
        """
        Create a VarInt from bytes or an integer.

        Args:
            source: Either bytes to decode or an integer to encode.
        """
        if isinstance(source, int):
            self.value = source
            self._bytes = VarInt.encode(source)
        else:
            result = VarInt.decode(source)
            self.value = result["value"]
            self._bytes = bytes(source[:result["length"]])

    @staticmethod
    def encode(value: int) -> bytes:
        """Encode an integer as a varint."""
        if value < 0:
            raise ValueError("VarInt cannot encode negative values")
        result = bytearray()
        while value >= 0x80:
            result.append((value & 0x7F) | 0x80)
            value >>= 7
        result.append(value)
        return bytes(result)

    @staticmethod
    def decode(data: Union[bytes, bytearray], offset: int = 0) -> dict:
        """
        Decode a varint from bytes.

        Returns:
            dict with 'value', 'length', and 'bytes' keys.
        """
        value = 0
        shift = 0
        length = 0

        while True:
            if offset + length >= len(data):
                raise ValueError("Varint decode: buffer underflow")
            byte = data[offset + length]
            value |= (byte & 0x7F) << shift
            length += 1
            if (byte & 0x80) == 0:
                break
            shift += 7

        return {
            "value": value,
            "length": length,
            "bytes": bytes(data[offset:offset + length]),
        }

    def to_hex_string(self) -> str:
        """Return hex representation of the encoded bytes."""
        return _bytes_to_hex(self._bytes)

    def __str__(self) -> str:
        return f"0x{self.value:x}"

    def __repr__(self) -> str:
        return f"VarInt({self.value})"

    def __len__(self) -> int:
        return len(self._bytes)

    def data(self) -> bytes:
        """Return the raw encoded bytes."""
        return self._bytes


# Base36 encoding/decoding
def encode_base36(data: bytes) -> str:
    """Encode bytes as uppercase base36 string."""
    num = int.from_bytes(data, byteorder="big", signed=False)
    if num == 0:
        return "0"

    chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    result = []
    while num > 0:
        num, rem = divmod(num, 36)
        result.append(chars[rem])
    return "".join(reversed(result))


def decode_base36(base36_str: str) -> bytes:
    """Decode a base36 string to bytes."""
    num = int(base36_str, 36)
    if num == 0:
        return b"\x00"
    num_bytes = (num.bit_length() + 7) // 8
    return num.to_bytes(num_bytes, "big")


def test_base36(base36_str: str) -> bool:
    """Test if a string is valid base36."""
    return bool(re.match(r'^[A-Za-z0-9]+$', base36_str))


# URL-safe Base64 encoding/decoding
def decode_url64(encoded: str) -> str:
    """Convert URL-safe base64 to standard base64."""
    result = encoded.replace("-", "+").replace("_", "/")
    # Add padding
    while len(result) % 4:
        result += "="
    return result


def encode_url64(base64_str: str) -> str:
    """Convert standard base64 to URL-safe base64 (no padding)."""
    return base64_str.replace("=", "").replace("+", "-").replace("/", "_")


def _is_valid_objectid_timestamp(data: bytes) -> bool:
    """Check if the first 4 bytes form a valid ObjectId timestamp."""
    if len(data) < 4:
        return False
    # First 4 bytes are big-endian Unix timestamp
    timestamp = struct.unpack(">I", data[:4])[0]
    return MIN_OBJECTID_TIMESTAMP <= timestamp <= MAX_OBJECTID_TIMESTAMP


def _get_batch_id_and_index(buffer: bytes, mode: str) -> dict:
    """
    Parse a buffer into batchId and index.

    Args:
        buffer: Raw bytes containing ObjectId + varint index
        mode: 'strict' (known prefixes only), 'mongo' (valid timestamp), or 'any'

    Returns:
        dict with 'batchId' (ObjectId) and 'index' (int)
    """
    if len(buffer) < 13:
        raise ValueError(f"Buffer too short: expected at least 13 bytes, got {len(buffer)}")

    id_bytes = buffer[:12]
    hex_id = _bytes_to_hex(id_bytes)

    # Check for known RetailID prefixes
    has_known_prefix = any(hex_id.startswith(prefix) for prefix in RETAILID_PREFIXES)

    if not has_known_prefix:
        if mode == "strict":
            raise ValueError(f"unknown prefix {hex_id}")
        elif mode == "mongo":
            if not _is_valid_objectid_timestamp(id_bytes):
                raise ValueError(f"invalid mongo timestamp {hex_id}")

    batch_id = ObjectId(hex_id)
    result = VarInt.decode(buffer[12:])

    return {"batchId": batch_id, "index": result["value"]}


def _get_batch_id_and_index_from_url(url: str, strict: bool = False) -> dict:
    """
    Parse a RetailID URL into batchId and index.

    Args:
        url: Full URL or just the short code
        strict: If True, require known prefix or valid MongoDB timestamp

    Returns:
        dict with 'batchId' (ObjectId) and 'index' (int)
    """
    short_code = url

    if "http" in url.lower():
        parts = url.split("//", 1)
        if len(parts) < 2:
            raise ValueError(f"Invalid URL: {url}")
        uri = parts[1]
        path_parts = uri.split("/")
        if len(path_parts) < 2:
            raise ValueError(f"no paths for domain: {path_parts[0]}, full: {url}")
        short_code = path_parts[-1]
        if not short_code:
            raise ValueError(f"no id in url {url}")

    # Mixed case = definitely base64, all uppercase = could be either
    short_code_is_all_uppercase = short_code == short_code.upper()

    def try_parse(buf: bytes, mode: str):
        try:
            return _get_batch_id_and_index(buf, mode)
        except Exception:
            return None

    def decode_base36_buf():
        return decode_base36(short_code)

    def decode_base64_buf():
        return base64.urlsafe_b64decode(decode_url64(short_code))

    # 1. Try strict mode (known prefixes only) with both encodings
    try:
        result = try_parse(decode_base36_buf(), "strict")
        if result:
            return result
    except Exception:
        pass

    try:
        result = try_parse(decode_base64_buf(), "strict")
        if result:
            return result
    except Exception:
        pass

    # 2. Try mongo/any mode with both encodings
    mode = "mongo" if strict else "any"

    if short_code_is_all_uppercase:
        try:
            result = try_parse(decode_base36_buf(), mode)
            if result:
                return result
        except Exception:
            pass

    try:
        result = try_parse(decode_base64_buf(), mode)
        if result:
            return result
    except Exception:
        pass

    raise ValueError(f"Unrecognized URL: {url}")


class RetailIdPair:
    """
    Represents a decoded RetailID consisting of a batch ID and index.

    Can be created from a URL and re-encoded to a URL.
    """

    __slots__ = ("batch_id", "index")

    def __init__(self, string_url: str, strict: bool = False):
        """
        Create a RetailIdPair by decoding a URL.

        Args:
            string_url: The RetailID URL to decode
            strict: If True, require known prefix or valid MongoDB timestamp
        """
        result = _get_batch_id_and_index_from_url(string_url, strict)
        self.batch_id: ObjectId = result["batchId"]
        self.index: int = result["index"]

    def encode(
        self,
        domain: Optional[str] = None,
        base64: bool = False,
    ) -> str:
        """
        Encode this RetailIdPair to a URL.

        Args:
            domain: Domain to use (default: '1a4.com')
            base64: If True, use URL-safe base64 encoding; otherwise use base36

        Returns:
            The encoded URL
        """
        return get_short_url(self.batch_id, self.index, domain=domain, base64=base64)

    def __repr__(self) -> str:
        return f"RetailIdPair(batch_id={self.batch_id!r}, index={self.index})"

    # Aliases for backwards compatibility with existing Python code
    @property
    def tag(self) -> str:
        """Alias for batch_id.to_hex_string() for backwards compatibility."""
        return self.batch_id.to_hex_string()

    @property
    def batchId(self) -> ObjectId:
        """Alias for batch_id for JavaScript-style naming."""
        return self.batch_id


def _get_buffer(batch_id: ObjectId, index: int) -> bytes:
    """Combine batch_id and varint-encoded index into bytes."""
    varint_bytes = VarInt.encode(index)
    return batch_id.id + varint_bytes


def get_short_url(
    batch_id: Union[ObjectId, str],
    index: int,
    domain: Optional[str] = None,
    base64: bool = False,
) -> str:
    """
    Encode an ObjectId and index to a RetailID URL.

    Args:
        batch_id: The ObjectId (or 24-char hex string)
        index: The index within the batch
        domain: Domain to use (default: '1a4.com')
        base64: If True, use URL-safe base64 encoding; otherwise use base36

    Returns:
        The encoded URL
    """
    if domain is None:
        domain = "1a4.com"

    if isinstance(batch_id, str):
        batch_id = ObjectId(batch_id)

    buffer = _get_buffer(batch_id, index)

    if base64:
        import base64 as b64
        encoded = b64.urlsafe_b64encode(buffer).decode("ascii").rstrip("=")
        return f"https://{domain}/{encoded}"
    else:
        encoded = encode_base36(buffer)
        return f"HTTPS://{domain.upper()}/{encoded}"


# Backwards compatibility: expose RetailId as a class with static methods
class RetailId:
    """Static methods for encoding/decoding RetailID URLs (backwards compatibility)."""

    @staticmethod
    def encode(tag: str, index: int, use_base64: bool = False) -> str:
        """
        Encode a tag and index to a RetailID URL.

        Args:
            tag: 24-character hex string
            index: Index within the batch
            use_base64: If True, use URL-safe base64 encoding
        """
        return get_short_url(tag, index, base64=use_base64)

    @staticmethod
    def decode(qr: str) -> RetailIdPair:
        """Decode a RetailID URL to a RetailIdPair."""
        return RetailIdPair(qr)
