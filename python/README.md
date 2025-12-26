# RetailID Python SDK

Official Python SDK for integrating with [Metrc RetailID](https://www.metrc.com/retailid/).

Encode and decode RetailID QR labels to enable product traceability and supply chain visibility in your Python applications.

## Installation

```bash
pip install retailid
```

Or with [uv](https://github.com/astral-sh/uv):

```bash
uv pip install retailid
```

## Quick Start

```python
from retailid import RetailIdPair, ObjectId, get_short_url

# Decode a RetailID URL
pair = RetailIdPair("HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL")
print(f"Batch ID: {pair.batch_id}")  # ABCDEF012345670000027190
print(f"Index: {pair.index}")         # 1

# Re-encode to URL (base36 by default)
url = pair.encode(domain="d.1a4.com")
print(url)  # HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL

# Encode with base64 (legacy format)
url_b64 = pair.encode(base64=True, domain="d.1a4.com")
print(url_b64)  # https://d.1a4.com/q83vASNFZwAAAnGQ5QM

# Create from components
batch_id = ObjectId("ABCDEF012345670000027190")
url = get_short_url(batch_id, index=1, domain="d.1a4.com")
print(url)  # HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL
```

## API Reference

### RetailIdPair

Represents a decoded RetailID consisting of a batch ID and index.

```python
class RetailIdPair:
    def __init__(self, string_url: str): ...

    batch_id: ObjectId  # The batch ObjectId
    index: int          # The index within the batch

    def encode(self, domain: str = None, base64: bool = False) -> str: ...
```

### ObjectId

Minimal ObjectId implementation compatible with MongoDB ObjectIds.

```python
class ObjectId:
    def __init__(self, input: str | bytes | None = None): ...

    @property
    def id(self) -> bytes: ...        # Raw 12 bytes
    def to_hex_string(self) -> str: ... # 24-char hex string
    def equals(self, other) -> bool: ...
```

### VarInt

Variable-length integer encoding (LEB128 unsigned).

```python
class VarInt:
    @staticmethod
    def encode(value: int) -> bytes: ...

    @staticmethod
    def decode(data: bytes, offset: int = 0) -> dict: ...
```

### Utility Functions

```python
# Encode/decode base36
encode_base36(data: bytes) -> str
decode_base36(base36_str: str) -> bytes
test_base36(base36_str: str) -> bool

# URL-safe base64 conversion
encode_url64(base64_str: str) -> str  # Standard to URL-safe
decode_url64(encoded: str) -> str      # URL-safe to standard

# Direct URL encoding
get_short_url(batch_id: ObjectId | str, index: int,
              domain: str = None, base64: bool = False) -> str
```

## Backwards Compatibility

For compatibility with the original `rid.py`, the `RetailId` class with static methods is also available:

```python
from retailid import RetailId

# Encode
url = RetailId.encode("abcdef012345670000027190", 485, use_base64=False, domain="d.1a4.com")

# Decode
pair = RetailId.decode("HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL")
print(pair.tag)    # abcdef012345670000027190
print(pair.index)  # 485
```

## URL Formats

RetailID supports two URL formats:

### Base36 (default, recommended)
- Uppercase: `HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL`
- Alphanumeric only (0-9, A-Z)
- Slightly longer but more robust for QR codes

### Base64 (legacy)
- Lowercase: `https://1a4.com/q83vASNFZwAAAnGQ5QM`
- URL-safe base64 (uses `-` and `_` instead of `+` and `/`)
- Slightly shorter but may cause issues with some QR scanners

## Development

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Type checking
mypy src/retailid

# Linting
ruff check src tests
```

## License

MIT License - Copyright 2025 Metrc, LLC
