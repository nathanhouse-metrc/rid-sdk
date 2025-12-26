# RetailID SDK

Official SDKs for integrating with [Metrc RetailID](https://www.metrc.com/retailid/).

RetailID enhances supply chain visibility through unique QR code labeling. Each label encodes a batch identifier and index into a compact, scannable URL—enabling product traceability, authenticity verification, and streamlined operations from production to point of sale.

Use these SDKs to encode and decode RetailID labels in your applications.

## Available SDKs

| Language | Package | Version | Install |
|----------|---------|---------|---------|
| [JavaScript](./javascript/) | `@metrc/retailid` | 0.10.0 | `npm install @metrc/retailid` |
| [Python](./python/) | `retailid` | 0.10.0 | `pip install retailid` |
| [Java](./java/) | `retailid-sdk` | 1.0.0 | Maven (see below) |

## Quick Examples

### Encoding

Create a short URL from a batch ID and index:
- default domain in the SDK is 1A4.COM - we're using a demo domain for our examples so we pass in a custom domain

**JavaScript**
```javascript
import { getShortUrl, ObjectId } from '@metrc/retailid';

const batchId = new ObjectId('ABCDEF012345670000027190');
const url = getShortUrl(batchId, 485, {domain: "d.1a4.com"});
// => "HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL"
```

**Python**
```python
from retailid import ObjectId, get_short_url

batch_id = ObjectId('abcdef012345670000027190')
url = get_short_url(batch_id, 485, domain="d.1a4.com")
# => "HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL"
```

**Java**
```java
import com.retailid.ObjectId;
import com.retailid.RetailId;

ObjectId batchId = new ObjectId("abcdef012345670000027190");
String url = RetailId.encode(batchId, 485);
// => "HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL"
```

### Decoding

Parse a short URL back to its components:

**JavaScript**
```javascript
import { RetailIdPair } from '@metrc/retailid';

const pair = new RetailIdPair('HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL');
console.log(pair.batchId.toHexString()); // "abcdef012345670000027190"
console.log(pair.index);                  // 485
```

**Python**
```python
from retailid import RetailIdPair

pair = RetailIdPair('HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL')
print(pair.batch_id.to_hex_string())  # "ABCDEF012345670000027190"
print(pair.index)                      # 485
```

**Java**
```java
import com.retailid.RetailIdPair;
EncodeOptions options = new EncodeOptions().setDomain("D.1A4.COM);
RetailIdPair pair = new RetailIdPair("HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL");
System.out.println(pair.getBatchId().toHexString()); // "ABCDEF012345670000027190"
System.out.println(pair.getIndex());                  // 485
```

## URL Formats

RetailID supports two encoding formats:

| Format | URL Pattern              | Case | Use |
|--------|--------------------------|------|-----|
| Base36 | `HTTPS://1A4.COM/<CODE>` | Uppercase | Default, recommended |
| Base64 | `https://1a4.com/<CODE>` | Mixed | Legacy support |

Base36 encoding produces case-insensitive codes using only alphanumeric characters (0-9, A-Z), making them easier to type manually if needed.

## Core Concepts

### ObjectId

A 12-byte identifier compatible with MongoDB ObjectIds. The first 4 bytes encode a timestamp, which is used for validation.

### VarInt

Variable-length integer encoding (LEB128). Small indices use fewer bytes, keeping URLs compact.

## Installation

### JavaScript / TypeScript

```bash
npm install @metrc/retailid
```

Works in Node.js and browsers. Provides TypeScript definitions.

### Python

```bash
pip install retailid
```

Requires Python 3.9+. Zero production dependencies.

### Java

Add to your `pom.xml`:

```xml
<dependency>
    <groupId>com.retailid</groupId>
    <artifactId>retailid-sdk</artifactId>
    <version>1.0.0</version>
</dependency>
```

Requires Java 11+. Zero production dependencies.

## API Reference

See the individual SDK READMEs for complete API documentation:

- [JavaScript SDK](./javascript/README.md)
- [Python SDK](./python/README.md)
- [Java SDK](./java/README.md)

## License

MIT
