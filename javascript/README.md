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
const batchId = new ObjectId('ABCDEF012345670000027190');
const url = getShortUrl(batchId, 1, {domain: "d.1a4.com"});
// => "HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL"

// Decode a short URL back to its components
const pair = new RetailIdPair('HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL');
console.log(pair.batchId.toHexString()); // "abcdef012345670000027190"
console.log(pair.index);                  // 1
```

---

## Decoding a QR URL

Parse a scanned QR code URL to extract the tag (batch ID) and index:

```javascript
const pair = new RetailIdPair("HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL");

console.log(pair.batchId.toHexString());  // "abcdef012345670000027190"
console.log(pair.index);                   // 1
```

Both URL formats are supported:
- **Base36 (current):** `HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL`
- **Base64 (legacy):** `https://d.1a4.com/q83vASNFZwAAAnGQAQ`

Both examples encode the same label (tag `abcdef012345670000027190`, index 1).

The SDK detects the encoding from the short code itself, not from the case of the URL. It tries Base36 and URL-safe Base64, preferring a result whose batch ID has a known RetailID prefix. A mixed-case short code can only be Base64. A bare short code (without the domain) is also accepted.

---

## Creating a URL from Tag + Index

Generate a URL directly from a tag (hex string) and index:

```javascript
const tag = "ABCDEF012345670000027190";
const index = 1;

// Base36 (default)
const url = getShortUrl(new ObjectId(tag), index, {domain: 'd.1a4.com'});
// "HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL"

// Base64
const legacyUrl = getShortUrl(new ObjectId(tag), index, { base64: true, domain: 'd.1a4.com' });
// "https://d.1a4.com/q83vASNFZwAAAnGQAQ"

// Custom domain
const customUrl = getShortUrl(new ObjectId(tag), index, { domain: 'example.com' });
// "HTTPS://EXAMPLE.COM/10NOIEYKAJDG6CF0EXGJL"
```

---

## Full Round-Trip Example

```javascript
// 1. Scan a QR code
const scannedUrl = "HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL";

// 2. Decode to get tag and index
const pair = new RetailIdPair(scannedUrl);
const tag = pair.batchId.toHexString();  // "abcdef012345670000027190"
const index = pair.index;                 // 1

// 3. Use tag and index in your application
console.log(`Tag: ${tag}, Index: ${index}`);

// 4. Re-encode if needed (the domain defaults to 1a4.com; pass it to keep the original)
const newUrl = pair.encode({ domain: 'd.1a4.com' });
console.log(newUrl);  // "HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL"
```

---

## API Reference

### ObjectId

A 12-byte MongoDB-compatible identifier.

```typescript
// Create from hex string
const oid = new ObjectId('ABCDEF012345670000027190');

// Create from Uint8Array
const oid = new ObjectId(bytes);

// Generate new random ObjectId
const oid = new ObjectId();

// Properties and methods
oid.id;              // Uint8Array (12 bytes)
oid.toHexString();   // "abcdef012345670000027190" (always lowercase)
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
VarInt.decode(bytes);            // { value: number, length: number, bytes: Uint8Array }

// Instance methods
v.toHexString();   // hex representation
v.toString();      // hex string, e.g. "0x80"
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
| `pair.encode()` | Re-encode to Base36 URL on the default domain (`1a4.com`) |
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
| Types (ESM) | `dist/index.d.ts` | TypeScript definitions for `import` |
| Types (CJS) | `dist/index.d.cts` | TypeScript definitions for `require()` |

---

## Test Vectors

| URL | Tag | Index |
|-----|-----|-------|
| `HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL` | `abcdef012345670000027190` | 1 |
| `HTTPS://D.1A4.COM/78OEAYDSAXRN14AQY5YCCH` | `abcdef012345670000027190` | 128 |
| `HTTPS://D.1A4.COM/1FHPHPWI19S4JRYKFMYC8HS1` | `abcdef012345670000027190` | 16384 |
| `https://d.1a4.com/q83vASNFZwAAAnGQEQ` | `abcdef012345670000027190` | 17 |

---

## Development

```bash
# Install the exact dependency versions from package-lock.json
npm ci

# Type-check sources and tests (strict)
npm run typecheck

# Build all bundles and type declarations
npm run build

# Run tests (builds first; the browser test runs against dist/retailid.min.js)
npm test

# Verify the packed package: contents, ESM/CJS exports, and TypeScript resolution
npm run verify:package

# Verify QR bundles are byte-identical to a baseline ref (default: upstream/main)
npm run verify:qr-bundle
```

The toolchain (including TypeScript) is pinned in `package-lock.json`. Use `npm ci` so builds are reproducible.

## License

MIT
