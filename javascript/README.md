# RetailID JavaScript SDK

Official JavaScript/TypeScript SDK for integrating with [Metrc RetailID](https://www.metrc.com/retailid/).

Encode and decode RetailID QR labels to enable product traceability and supply chain visibility in your web and Node.js applications.

## Installation

### npm / yarn / pnpm

```bash
npm install @metrc/retailid
```

### CDN (Browser)

```html
<!-- Latest version -->
<script src="https://cdn.1a4.com/qr/js/retailid.min.js"></script>

<!-- Or pinned version -->
<script src="https://cdn.1a4.com/qr/js/v0.10.0/retailid.min.js"></script>
```

The CDN script exposes a global `RetailId` object.

---

## Quick Start

```javascript
import { ObjectId, RetailIdPair, getShortUrl } from '@metrc/retailid';

// Encode a batch ID and index to a short URL
const batchId = new ObjectId('1a4060300020081000006609');
const url = getShortUrl(batchId, 1);
// => "HTTPS://1A4.COM/5LN8CBN1UB33DON9CHKX"

// Decode a short URL back to its components
const pair = new RetailIdPair('HTTPS://1A4.COM/5LN8CBN1UB33DON9CHKX');
console.log(pair.batchId.toHexString()); // "1a4060300020081000006609"
console.log(pair.index);                  // 1
```

---

## Decoding a QR URL

Parse a scanned QR code URL to extract the tag (batch ID) and index:

```javascript
const pair = new RetailIdPair("HTTPS://1A4.COM/5LN8CBN1UB33DON9CHKX");

console.log(pair.batchId.toHexString());  // "1a4060300020081000006609"
console.log(pair.index);                   // 1
```

Both URL formats are supported:
- **Base36 (current):** `HTTPS://1A4.COM/5LN8CBN1UB33DON9CHKX`
- **Base64 (legacy):** `https://1a4.com/GkBgMAAEG2AAAJKXEQ`

The SDK auto-detects the format based on URL case:
- Uppercase `HTTPS://` → Base36 decoding
- Lowercase `https://` → Base64 decoding

---

## Creating a URL from Tag + Index

Generate a URL directly from a tag (hex string) and index:

```javascript
const tag = "1a4060300020081000006609";
const index = 1;

// Base36 (default)
const url = getShortUrl(new ObjectId(tag), index);
// "HTTPS://1A4.COM/5LN8CBN1UB33DON9CHKX"

// Base64
const legacyUrl = getShortUrl(new ObjectId(tag), index, { base64: true });
// "https://1a4.com/GkBgAwACAIEAAAZmCQE"

// Custom domain
const customUrl = getShortUrl(new ObjectId(tag), index, { domain: 'example.com' });
// "HTTPS://EXAMPLE.COM/5LN8CBN1UB33DON9CHKX"
```

---

## Full Round-Trip Example

```javascript
// 1. Scan a QR code
const scannedUrl = "HTTPS://1A4.COM/5LN8CBN1UB33DON9CHKX";

// 2. Decode to get tag and index
const pair = new RetailIdPair(scannedUrl);
const tag = pair.batchId.toHexString();  // "1a4060300020081000006609"
const index = pair.index;                 // 1

// 3. Use tag and index in your application
console.log(`Tag: ${tag}, Index: ${index}`);

// 4. Re-encode if needed
const newUrl = pair.encode();
console.log(newUrl);  // "HTTPS://1A4.COM/5LN8CBN1UB33DON9CHKX"
```

---

## API Reference

### ObjectId

A 12-byte MongoDB-compatible identifier.

```typescript
// Create from hex string
const oid = new ObjectId('1a40603000041b6000009297');

// Create from Uint8Array
const oid = new ObjectId(bytes);

// Generate new random ObjectId
const oid = new ObjectId();

// Properties and methods
oid.id;              // Uint8Array (12 bytes)
oid.toHexString();   // "1a40603000041b6000009297"
oid.equals(other);   // boolean
```

### VarInt

Variable-length integer encoding (LEB128).

```typescript
// Create from number
const v = new VarInt(128);

// Create from bytes
const v = new VarInt(bytes);

// Static methods
VarInt.encode(128);              // Uint8Array
VarInt.decode(bytes, offset);    // { value: number, length: number }

// Instance methods
v.toHexString();   // hex representation
v.toString();      // decimal string
v.length();        // byte length
v.data();          // Uint8Array
```

### RetailIdPair

Decoded RetailID representation.

| Method | Description |
|--------|-------------|
| `new RetailIdPair(url)` | Decode a QR URL into tag + index |
| `pair.batchId` | ObjectId - the batch identifier |
| `pair.index` | number - the index within the batch |
| `pair.encode()` | Re-encode to Base36 URL (default) |
| `pair.encode({ base64: true })` | Re-encode to Base64 URL (legacy) |
| `pair.encode({ domain: 'example.com' })` | Re-encode with custom domain |

### getShortUrl

| Method | Description |
|--------|-------------|
| `getShortUrl(objectId, index)` | Create Base36 URL from ObjectId + index |
| `getShortUrl(objectId, index, { base64: true })` | Create Base64 URL (legacy) |
| `getShortUrl(objectId, index, { domain: 'example.com' })` | Create URL with custom domain |

### Utility Functions

| Function | Description |
|----------|-------------|
| `encodeBase36(bytes)` | Encode Uint8Array to uppercase Base36 string |
| `decodeBase36(str)` | Decode Base36 string to Uint8Array |
| `testBase36(str)` | Check if string is valid Base36 |
| `encodeUrl64(base64)` | Convert standard Base64 to URL-safe |
| `decodeUrl64(urlSafe)` | Convert URL-safe Base64 to standard |

---

## Bundle Formats

| Format | File | Use |
|--------|------|-----|
| ESM | `dist/retailid.esm.js` | Modern bundlers, Node.js ESM |
| CommonJS | `dist/retailid.cjs` | Node.js require() |
| Browser | `dist/retailid.min.js` | Script tag (IIFE) |
| Types | `dist/index.d.ts` | TypeScript definitions |

---

## Test Vectors

| URL | Tag | Index |
|-----|-----|-------|
| `HTTPS://1A4.COM/5LN8CBN1UB33DON9CHKX` | `1a4060300020081000006609` | 1 |
| `HTTPS://1A4.COM/13TX7BMRX3IU01B9EGTPTT` | `1a4060300020081000006609` | 128 |
| `HTTPS://1A4.COM/7V8S42PYJD1XC9C2UVNCD1D` | `1a4060300020081000006609` | 16384 |
| `https://1a4.com/GkBgMAAEG2AAAJKXEQ` | `1a40603000041b6000009297` | 17 |

---

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build
```

## License

ISC
