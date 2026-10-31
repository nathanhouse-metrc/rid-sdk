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

## Retail ID API Client (server-side)

`@metrc/retailid/api` is a typed client for the Metrc Retail ID API. It mirrors the Python
(`retailid.api`) and Java (`com.retailid.api`) clients method for method. It has zero runtime
dependencies and uses the native `fetch`.

> [!IMPORTANT]
> **Server-side only (Node.js 22+).** The client carries your vendor and user API keys and refuses
> to run in a browser. It is not part of the CDN bundle. Never send API keys to a browser, put them
> in URLs, or commit them; keep `config.json` out of version control.

### Imports

```js
// ESM
import { RetailIdClient, NotFoundError } from '@metrc/retailid/api';
import { loadConfig, createClientFromConfigFile } from '@metrc/retailid/node';

// CommonJS
const { RetailIdClient } = require('@metrc/retailid/api');
const { createClientFromConfigFile } = require('@metrc/retailid/node');
```

| Entry point | Contents | Environment |
|---|---|---|
| `@metrc/retailid` | QR encoding/decoding (unchanged) | Browser and Node |
| `@metrc/retailid/api` | `RetailIdClient`, models, errors, `RetailIdConfig` | Node.js 22+ (no Node built-ins imported) |
| `@metrc/retailid/node` | `loadConfig`, `createClientFromConfigFile` (reads files) | Node.js 22+ |

### Authentication and configuration

Requests use HTTP Basic authentication, with the **vendor (software) API key** as the username and
the **user API key** as the password. The keys are held in private fields and never appear in
`toString()`, `util.inspect`, `JSON.stringify`, error messages, or log output.

```js
const client = new RetailIdClient({
  vendorApiKey: process.env.METRC_VENDOR_KEY,
  userApiKey: process.env.METRC_USER_KEY,
  stateCode: 'md',          // -> https://api-md.metrc.com
  // baseUrl: 'https://sandbox-api-md.metrc.com',  // overrides stateCode (Sandbox, proxies)
  timeoutMs: 30_000,        // per attempt, including reading the body (default 30 000)
  maxRetries: 3,            // default 3
  backoffBaseMs: 1_000,     // default 1 000
});
```

Or load the **shared `config.json`** used by the Python and Java clients. Copy
[`config.example.json`](./config.example.json). Its keys are snake_case and its durations are in
**seconds**; they are converted to milliseconds when the client is created.

```json
{
  "vendor_api_key": "your-vendor-api-key",
  "user_api_key": "your-user-api-key",
  "state_code": "md",
  "base_url": null,
  "timeout": 30,
  "max_retries": 3,
  "backoff_base": 1.0
}
```

```js
// path argument, else $RETAILID_CONFIG, else ./config.json
const client = await createClientFromConfigFile('config.json', { maxRetries: 1 }); // overrides in ms
```

Validation is strict. A wrongly typed option throws `TypeError`; a disallowed value throws
`RangeError`. Nothing is coerced, so `"3"` is not accepted where a number is expected.

### Methods

Every method returns a Promise. The last argument is an optional `{ signal }` for cancellation;
`postSales` and the global-product methods accept extra options in the same object.

| Method | HTTP | Retried after 5xx / timeout? |
|---|---|---|
| `getFacilities()` | `GET /facilities/v2/` | yes |
| `getAllotment(license)` → `Allotment[]` | `GET /retailid/v2/allotment` | yes |
| `generate(license, label, quantity)` → `GenerateResult` | `POST /retailid/v2/generate` | **no** (write) |
| `getPackagesInfo(license, labels)` → `PackageInfo[]` | `POST /retailid/v2/packages/info` (batches of 10) | yes (read-only POST) |
| `getPackageInfo(license, label)` → `PackageInfo \| undefined` | same | yes |
| `getAvailableTags(license)` | `GET /tags/v2/package/available` | yes |
| `getPackage(license, idOrLabel)` | `GET /packages/v2/{idOrLabel}` | yes |
| `receive(license, label)` → `ReceiveResult` | `GET /retailid/v2/receive/{label}` | yes |
| `receiveByQr(license, qrUrlOrShortCode)` → `ReceiveResult` | `GET /retailid/v2/receive/qr/{shortCode}` | yes |
| `associate(license, associations)` | `POST /retailid/v2/associate` (1–10 entries) | **no** (write) |
| `associatePackage(license, label, qrUrls)` | same | **no** (write) |
| `merge(license, target, source)` | `POST /retailid/v2/merge` | **no** (write) |
| `postSales(license, records, { endpoint })` | `POST` to a `SALES_ENDPOINTS` path (1–10 records) | **no** (write) |
| `postSalesReceipts(license, receipts)` | `POST /sales/v2/receipts` | **no** (write) |
| `iterGlobalProducts(brandId, { pageSize })` | `GET /globalproducts/v2` (lazy, all pages) | yes |
| `getGlobalProducts(brandId, { pageSize })` | same, collected | yes |
| `getGlobalProduct(productId)` | `GET /globalproducts/v2/{id}` | yes |
| `request(method, path, { licenseNumber, params, body, idempotent })` | any | if `idempotent` (default: GET) |

```js
const LICENSE = '837-XYZ';
const LABEL = '1A4060300007777000000001';

const { issuanceId } = await client.generate(LICENSE, LABEL, 3);
const received = await client.receive(LICENSE, LABEL);
for (const url of received.eaches ?? []) printLabel(url); // print exactly as returned

await client.associatePackage(LICENSE, LABEL, ['https://1a4.com/ZScU6dsbUk98nsJEAA']);
await client.merge(LICENSE, LABEL, '1A4080300007747000000001'); // target first

for await (const product of client.iterGlobalProducts(77)) console.log(product);
```

### Errors, retries, timeouts, and cancellation

```
RetailIdError
├─ RetailIdApiError (statusCode, apiMessage, method, path, body)
│   ├─ BadRequestError 400   ├─ NotFoundError 404      ├─ RateLimitError 429 (retryAfterMs)
│   ├─ AuthenticationError 401 ├─ ConflictError 409    └─ ServerError 5xx
│   └─ PermissionDeniedError 403 └─ UnprocessableError 422
├─ RetailIdTimeoutError (method, path, timeoutMs, cause)
├─ RetailIdNetworkError (method, path, cause)
├─ RetailIdResponseError (field, statusCode, body) — a 2xx body that breaks the contract
└─ RetailIdConfigError
```

Messages read `"404 GET /retailid/v2/receive/1A4…: Package not found"`. `apiMessage` holds the
API's own text.

Retries follow the same policy as the Python and Java clients:
- **429** is retried for every method, waiting the numeric `Retry-After` when present. A 429
  means the request was rejected, not applied.
- **5xx and timeouts** are retried only for read-only calls.
- **Writes** (`generate`, `associate`, `merge`, sales) are **never** retried after a 5xx, a
  timeout, or a network failure, because they may already have been applied. After a
  `RetailIdTimeoutError` on a write, check state (`getPackagesInfo` / `receive`) before resending.
- **Network failures** (`RetailIdNetworkError`) are never retried. The original error is
  available as `cause`.
- **Backoff** without `Retry-After` is `backoffBaseMs × 2^(attempt−1) + 0–250 ms`.

`timeoutMs` applies to each attempt, including reading the body. To cancel a call, pass a
standard `AbortSignal`. Cancellation also stops any backoff wait, and the call rejects with the
signal's own reason:

```js
const controller = new AbortController();
setTimeout(() => controller.abort(), 5_000);
try {
  await client.getPackagesInfo(LICENSE, labels, { signal: controller.signal });
} catch (error) {
  if (error instanceof NotFoundError) { /* ... */ }
  else if (error?.name === 'AbortError') { /* cancelled by the caller */ }
  else throw error;
}
```

### Response models

`Allotment`, `GenerateResult`, `PackageInfo` (with `Issuance[]`) and `ReceiveResult` are frozen
objects with camelCase fields. Each keeps the full response in `raw`, including fields not modeled
here. Parsing never invents values:

| Response value | Result |
|---|---|
| Field absent or `null` (including lists such as `Eaches` or `Issuances`) | `null` — never a fabricated `0`, `false`, `""`, or `[]` |
| Correct JSON type | used as-is |
| Integer sent as a canonical string (`"5000"`) | accepted as `5000` |
| Anything else (`"abc"`, `12.7`, `"false"` for a boolean, …) | `RetailIdResponseError` naming the field |

> [!NOTE]
> This is the confirmed D2 policy. It deliberately differs from Python in
> places: Python defaults missing counts and flags to `0`/`False` and treats the string `"false"`
> as true. If a response error occurs on a write, the write succeeded; inspect `error.body` and do
> not resend.

Request and response wire formats follow the Python implementation. Formats not yet confirmed
against the Retail ID API Integration Guide are listed in the parity matrix that accompanies this
client.

## Bundle Formats

| Format | File | Use |
|--------|------|-----|
| ESM | `dist/retailid.esm.js` | Modern bundlers, Node.js ESM |
| CommonJS | `dist/retailid.cjs` | Node.js require() |
| Browser | `dist/retailid.min.js` | Script tag (IIFE) |
| Types (ESM) | `dist/index.d.ts` | TypeScript definitions for `import` |
| Types (CJS) | `dist/index.d.cts` | TypeScript definitions for `require()` |
| API client (ESM / CJS) | `dist/api/index.js` / `dist/api/index.cjs` | `@metrc/retailid/api` (server-side, not in the CDN bundle) |
| Node helpers (ESM / CJS) | `dist/node/index.js` / `dist/node/index.cjs` | `@metrc/retailid/node` |

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

# Coverage report for the API client (src/api, src/node). The provider is installed
# on demand, not committed, so the dependency tree stays minimal.
npm install --no-save @vitest/coverage-v8@3.2.7
npx vitest run --coverage

# Verify the packed package: contents, ESM/CJS exports, and TypeScript resolution
npm run verify:package

# Verify QR bundles are byte-identical to a baseline ref (default: upstream/main)
npm run verify:qr-bundle
```

The toolchain (including TypeScript) is pinned in `package-lock.json`. Use `npm ci` so builds are reproducible.

## License

MIT
