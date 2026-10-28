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

## Retail ID API Client

`RetailIdClient` calls the Metrc Retail ID endpoints (generate, info, receive, associate,
merge, sales, catalog). It uses only the standard library. Requests use HTTP Basic auth:
the vendor API key is the username and the user API key is the password. Keep both keys on
your server; the client never logs them.

```python
from retailid import RetailIdClient, Association

client = RetailIdClient(VENDOR_KEY, USER_KEY, state_code="md")  # https://api-md.metrc.com
# or: RetailIdClient(VENDOR_KEY, USER_KEY, base_url="https://<sandbox host>")

license_number = "837-XYZ"
label = "1A4060300007777000000001"

# Label printing
client.get_allotment(license_number)                 # New York only
issuance = client.generate(license_number, label, quantity=3)
info = client.get_package_info(license_number, label)  # qr_count, issuances, ...
received = client.receive(license_number, label)
for url in received.eaches:
    ...  # print one label per URL, exactly as returned

# Receiving
result = client.receive_by_qr(license_number, "https://1a4.com/ZScU6dsbUk98nsJEAA")
if result.requires_verification:
    client.associate(license_number, [Association(label, scanned_qr_urls)])
    result = client.receive(license_number, label)  # repeat until requires_verification is False

# Package Merge: target first, source second
client.merge(license_number, target_package_label, source_package_label)

# Sales: build the full record from the market's Sales docs, add QrCodes per transaction
client.post_sales_receipts(license_number, [receipt])
client.post_sales(license_number, [delivery], endpoint="deliveries_retailer")

# Catalog
for product in client.iter_global_products(brand_id=77):
    ...
client.get_global_product(5)
```

| Method | Endpoint |
|--------|----------|
| `get_facilities()` | `GET /facilities/v2/` |
| `get_allotment(license)` | `GET /retailid/v2/allotment` |
| `generate(license, label, quantity)` | `POST /retailid/v2/generate` |
| `get_packages_info(license, labels)` / `get_package_info` | `POST /retailid/v2/packages/info` |
| `receive(license, label)` | `GET /retailid/v2/receive/{label}` |
| `receive_by_qr(license, qr_url_or_code)` | `GET /retailid/v2/receive/qr/{shortCode}` |
| `associate(license, associations)` / `associate_package` | `POST /retailid/v2/associate` |
| `merge(license, target, source)` | `POST /retailid/v2/merge` |
| `post_sales(license, records, endpoint=...)` / `post_sales_receipts` | `POST /sales/v2/receipts`, `/deliveries`, `/deliveries/retailer`, `/deliveries/retailer/sale` |
| `get_available_tags(license)` | `GET /tags/v2/package/available` |
| `get_package(license, id_or_label)` | `GET /packages/v2/{id}` |
| `iter_global_products(brand_id)` / `get_global_products` | `GET /globalproducts/v2?brandId=` (all pages) |
| `get_global_product(id)` | `GET /globalproducts/v2/{id}` |

### Errors, retries, and limits

- Non-2xx responses raise a `RetailIdApiError` subclass: `BadRequestError` (400),
  `AuthenticationError` (401), `PermissionDeniedError` (403), `NotFoundError` (404),
  `ConflictError` (409), `UnprocessableError` (422), `RateLimitError` (429), `ServerError` (5xx).
- 429 is retried after the `Retry-After` delay (or an increasing backoff). Timeouts and 5xx
  are retried only for reads (GET and `packages/info`).
- Calls that change data (`generate`, `associate`, `merge`, sales) are never retried
  automatically. A timeout raises `RetailIdTimeoutError`: check the current state with
  `get_packages_info` or `receive` before sending again.
- List requests are capped at 10 records. `get_packages_info` splits larger lists for you;
  `associate` and `post_sales` raise `ValueError` instead, so you control each change.

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
