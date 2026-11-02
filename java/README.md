# RetailID Java SDK

Official Java SDK for integrating with [Metrc RetailID](https://www.metrc.com/retailid/).

Encode and decode RetailID QR labels to enable product traceability and supply chain visibility in your Java applications.

## Overview

Each RetailID label encodes:
- A **batch ID** (12-byte identifier)
- An **index** (variable-length integer)

These are encoded as compact, URL-safe strings using either Base36 (uppercase) or Base64 (lowercase) format.

## Installation

### Maven

Add to your `pom.xml`:

```xml
<dependency>
    <groupId>com.retailid</groupId>
    <artifactId>retailid-sdk</artifactId>
    <version>1.0.0</version>
</dependency>
```

### Gradle

Add to your `build.gradle`:

```gradle
dependencies {
    implementation 'com.retailid:retailid-sdk:1.0.0'
}
```

## Quick Start

### Encoding

```java
import com.retailid.*;

// Create a batch ID
ObjectId batchId = new ObjectId("ABCDEF012345670000027190");

// Encode as Base36 (default, uppercase)
EncodeOptions options = new EncodeOptions().setDomain("d.1a4.com");
String url = RetailId.encode(batchId, 485, options);
// Result: "HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL"

// Encode as Base64
EncodeOptions options = new EncodeOptions().setBase64(true).setDomain("d.1a4.com");
String urlBase64 = RetailId.encode(batchId, 485, options);
// Result: "https://d.1a4.com/q83vASNFZwAAAnGQ5QM"

// Custom domain
EncodeOptions customDomain = new EncodeOptions().setDomain("d.1a4.com");
String urlCustom = RetailId.encode(batchId, 485, customDomain);
// Result: "HTTPS://d.1a4.com/10NOIEYKAJDG6CF0EXGJL"
```

### Decoding

```java
import com.retailid.*;

// Decode a RetailID URL
RetailIdPair pair = RetailId.decode("HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL");

ObjectId batchId = pair.getBatchId();
int index = pair.getIndex();

System.out.println("Batch ID: " + batchId.toHexString());  // "ABCDEF012345670000027190"
System.out.println("Index: " + index);                      // 485
```

### Using RetailIdPair

```java
import com.retailid.*;

// Construct from URL
RetailIdPair pair = new RetailIdPair("HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL");

// Access properties
ObjectId batchId = pair.getBatchId();
int index = pair.getIndex();

// Encode back to URL
String url = pair.encode();

// Encode with options
EncodeOptions options = new EncodeOptions().setBase64(true);
String urlBase64 = pair.encode(options);
```

## API Reference

### `RetailId` Class

Main API for encoding and decoding RetailID URLs.

#### Methods

- `static String encode(ObjectId batchId, int index)`
  - Encodes a RetailID to a URL string with default options (base36, 1a4.com)

- `static String encode(ObjectId batchId, int index, EncodeOptions options)`
  - Encodes a RetailID to a URL string with custom options

- `static RetailIdPair decode(String url)`
  - Decodes a RetailID URL string to a RetailIdPair

### `RetailIdPair` Class

Represents a decoded RetailID.

#### Constructors

- `RetailIdPair(String url)`
  - Constructs by parsing a URL

- `RetailIdPair(ObjectId batchId, int index)`
  - Constructs from batch ID and index

#### Methods

- `ObjectId getBatchId()` - Returns the batch ID
- `int getIndex()` - Returns the package index
- `String encode()` - Encodes to URL with default options
- `String encode(EncodeOptions options)` - Encodes with custom options

### `ObjectId` Class

12-byte MongoDB ObjectId implementation.

#### Constructors

- `ObjectId()` - Generate random ObjectId
- `ObjectId(String hexString)` - From 24-char hex string
- `ObjectId(byte[] bytes)` - From 12-byte array

#### Methods

- `byte[] getId()` - Returns the raw bytes (copy)
- `String toHexString()` - Converts to hex string
- `boolean equals(Object other)` - Compare with ObjectId or byte array

### `VarInt` Class

Variable-length integer encoding (LEB128).

#### Constructors

- `VarInt(int value)` - Encode an integer
- `VarInt(byte[] source)` - Decode from bytes

#### Methods

- `static byte[] encode(int num)` - Encode integer to bytes
- `static DecodeResult decode(byte[] source)` - Decode from bytes
- `static DecodeResult decode(byte[] source, int offset)` - Decode with offset
- `int getValue()` - Get decoded value
- `byte[] data()` - Get encoded bytes
- `int length()` - Get byte length

### `EncodeOptions` Class

Options for encoding RetailID URLs.

#### Methods

- `String getDomain()` - Get the domain (default: "1a4.com")
- `EncodeOptions setDomain(String domain)` - Set custom domain
- `boolean isBase64()` - Check if using base64 (default: false)
- `EncodeOptions setBase64(boolean base64)` - Set encoding format

### Utility Classes

#### `Base36`

- `static String encode(byte[] bytes)` - Encode to Base36
- `static byte[] decode(String base36)` - Decode from Base36
- `static boolean isValid(String base36)` - Check if valid Base36

#### `UrlEncoder`

- `static String encodeUrl64(String base64)` - Convert to URL-safe Base64
- `static String decodeUrl64(String encoded)` - Convert from URL-safe Base64
- `static String bytesToUrlBase64(byte[] bytes)` - Encode bytes to URL Base64
- `static byte[] urlBase64ToBytes(String urlBase64)` - Decode URL Base64 to bytes

## Retail ID API Client

`com.retailid.api.RetailIdClient` calls the Metrc Retail ID endpoints (generate, info, receive,
associate, merge, sales, catalog) using the JDK's `java.net.http.HttpClient` — no extra
dependencies. Requests use HTTP Basic auth: the vendor API key is the username and the user API
key is the password. Keep both keys on your server; the client never logs them.

### Configuration (`config.json`)

Put the API keys in a `config.json` instead of in source code. Start from the template:

```bash
cp config.example.json config.json
```

```json
{
    "vendor_api_key": "YOUR_VENDOR_API_KEY",
    "user_api_key": "YOUR_USER_API_KEY",
    "state_code": "md",
    "base_url": null,
    "timeout": 30,
    "max_retries": 3,
    "backoff_base": 1.0
}
```

| Key | Required | Description |
|-----|----------|-------------|
| `vendor_api_key` | yes | Vendor (software) API key |
| `user_api_key` | yes | API key of the Metrc user making requests |
| `state_code` | one of | Market code, e.g. `"md"` → `https://api-md.metrc.com` |
| `base_url` | one of | Full base URL; overrides `state_code` (use for the Sandbox) |
| `timeout` | no | Per-request timeout in seconds (default 30) |
| `max_retries` | no | Retries for retryable responses (default 3) |
| `backoff_base` | no | Base backoff delay in seconds (default 1.0) |

`config.json` is listed in `.gitignore`; never commit real keys. `RetailIdClient.fromConfig()`
reads the file named by the `RETAILID_CONFIG` environment variable, else `./config.json`.
A missing or incomplete file throws `RetailIdConfigException`.

```java
import com.retailid.api.*;

RetailIdClient client = RetailIdClient.fromConfig();                    // $RETAILID_CONFIG or ./config.json
RetailIdClient client = RetailIdClient.fromConfig(Paths.get("/etc/metrc/config.json"));
RetailIdClient client = RetailIdClient.builder(RetailIdConfig.load())   // builder settings override the file
    .timeout(Duration.ofSeconds(10))
    .build();

// Keys can still be passed directly, e.g. from a secrets manager:
RetailIdClient client = RetailIdClient.builder(vendorKey, userKey).stateCode("md").build();
```

Use `.transport(new JdkHttpTransport(myHttpClient))` to supply your own `HttpClient` (proxies,
custom SSL context), or implement `HttpTransport` yourself. The client closes only transports it
created; use try-with-resources or call `close()`:

```java
try (RetailIdClient client = RetailIdClient.fromConfig()) {
    client.getFacilities();
}
```

### Usage

```java
import com.retailid.api.*;

RetailIdClient client = RetailIdClient.fromConfig();

String licenseNumber = "837-XYZ";
String label = "1A4060300007777000000001";

// Label printing
client.getAllotment(licenseNumber);                       // New York only
GenerateResult issuance = client.generate(licenseNumber, label, 3);
Optional<PackageInfo> info = client.getPackageInfo(licenseNumber, label);  // qrCount, issuances, ...
ReceiveResult received = client.receive(licenseNumber, label);
for (String url : received.getEaches()) {
    // print one label per URL, exactly as returned
}

// Receiving
ReceiveResult result = client.receiveByQr(licenseNumber, "https://1a4.com/ZScU6dsbUk98nsJEAA");
if (result.requiresVerification()) {
    client.associate(licenseNumber, List.of(new Association(label, scannedQrUrls)));
    result = client.receive(licenseNumber, label);  // repeat until requiresVerification() is false
}

// Package Merge: target first, source second
client.merge(licenseNumber, targetPackageLabel, sourcePackageLabel);

// Sales: build the full record from the market's Sales docs, add QrCodes per transaction
client.postSalesReceipts(licenseNumber, List.of(receipt));               // receipt is a Map<String, Object>
client.postSales(licenseNumber, List.of(delivery), "deliveries_retailer");

// Catalog
Iterator<Object> products = client.iterGlobalProducts(77);  // pages are fetched as you iterate
client.getGlobalProduct(5);
```

JSON values are plain Java types: objects are `Map<String, Object>`, arrays are `List<Object>`,
numbers are `Long` (or `Double`). Response models (`ReceiveResult`, `PackageInfo`, ...) keep the
full response in `getRaw()`.

| Method | Endpoint |
|--------|----------|
| `getFacilities()` | `GET /facilities/v2/` |
| `getAllotment(license)` | `GET /retailid/v2/allotment` |
| `generate(license, label, quantity)` | `POST /retailid/v2/generate` |
| `getPackagesInfo(license, labels)` / `getPackageInfo` | `POST /retailid/v2/packages/info` |
| `receive(license, label)` | `GET /retailid/v2/receive/{label}` |
| `receiveByQr(license, qrUrlOrCode)` | `GET /retailid/v2/receive/qr/{shortCode}` |
| `associate(license, associations)` / `associatePackage` | `POST /retailid/v2/associate` |
| `merge(license, target, source)` | `POST /retailid/v2/merge` |
| `postSales(license, records, endpoint)` / `postSalesReceipts` | `POST /sales/v2/receipts`, `/deliveries`, `/deliveries/retailer`, `/deliveries/retailer/sale` |
| `getAvailableTags(license)` | `GET /tags/v2/package/available` |
| `getPackage(license, idOrLabel)` | `GET /packages/v2/{id}` |
| `iterGlobalProducts(brandId)` / `getGlobalProducts` | `GET /globalproducts/v2?brandId=` (all pages) |
| `getGlobalProduct(id)` | `GET /globalproducts/v2/{id}` |

### Errors, retries, and limits

- Non-2xx responses throw an unchecked `RetailIdApiException` subclass: `BadRequestException`
  (400), `AuthenticationException` (401), `PermissionDeniedException` (403), `NotFoundException`
  (404), `ConflictException` (409), `UnprocessableException` (422), `RateLimitException` (429,
  with `getRetryAfter()`), `ServerException` (5xx). Each carries `getStatusCode()`,
  `getApiMessage()`, `getMethod()`, `getPath()`, and the decoded `getBody()`.
  `RetailIdApiException.forStatus()` builds the matching error from a status and payload.
- 429 is retried after the `Retry-After` delay (or an increasing backoff). Timeouts and 5xx are
  retried only for reads (GET and `packages/info`).
- Calls that change data (`generate`, `associate`, `merge`, sales) are never retried
  automatically. A timeout throws `RetailIdTimeoutException`: check the current state with
  `getPackagesInfo` or `receive` before sending again. Other network failures throw
  `UncheckedIOException`.
- List requests are capped at 10 records. `getPackagesInfo` splits larger lists for you;
  `associate` and `postSales` throw `IllegalArgumentException` instead, so you control each change.
- Requests are logged through `java.util.logging` under `com.retailid.api` (keys are never logged).

## Test Vectors

The SDK passes all test vectors from the JavaScript SDK:

| URL | Batch ID | Index |
|-----|----------|-------|
| `HTTPS://1A4.COM/5LN8CBN1UB33DON9CHKX` | `1a4060300020081000006609` | 1 |
| `HTTPS://1A4.COM/13TX7BMRX3IU01B9EGTPTT` | `1a4060300020081000006609` | 128 |
| `HTTPS://1A4.COM/7V8S42PYJD1XC9C2UVNCD1D` | `1a4060300020081000006609` | 16384 |
| `https://1a4.com/GkBgMAAEG2AAAJKXEQ` | `1a40603000041b6000009297` | 17 |

## Building

```bash
# Compile
mvn compile

# Run tests
mvn test

# Package
mvn package

# Install to local repository
mvn install
```

## Requirements

- Java 11 or higher
- Maven 3.6 or higher (for building)

## Features

- **Zero external dependencies** - Uses only the Java standard library, including the Retail ID API client
- **Feature parity** with JavaScript SDK
- **Comprehensive tests** - Full JUnit 5 test suite
- **Javadoc documentation** - Complete API documentation
- **Type-safe API** - Leverages Java's type system
- **Immutable objects** - Thread-safe by design

## Encoding Formats

### Base36 (Default)

- Uses characters: 0-9, A-Z
- Case-insensitive during decode
- Produces uppercase URLs
- Prefix: `HTTPS://`
- Example: `HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL`

### Base64 (Optional)

- URL-safe Base64 (RFC 4648)
- Replaces `+` with `-` and `/` with `_`
- Removes padding (`=`)
- Produces lowercase URLs
- Prefix: `https://`
- Example: `https://1a4.com/GkBgMAAEG2AAAJKXEQ`

## Error Handling

All methods throw `IllegalArgumentException` for invalid inputs:

```java
try {
    RetailIdPair pair = RetailId.decode("invalid-url");
} catch (IllegalArgumentException e) {
    System.err.println("Invalid RetailID URL: " + e.getMessage());
}
```

## License

MIT License - Copyright (c) 2025 Metrc LLC

## Contributing

Contributions welcome! Please ensure:

1. All tests pass: `mvn test`
2. Code follows Java conventions
3. Javadoc is complete for public APIs
4. Test vectors remain valid

## Support

For issues or questions:
- GitHub Issues: https://github.com/MetrcID/retailid/issues
- Email: dev@metrc.com
