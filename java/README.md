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

- **Zero external dependencies** - Uses only Java standard library
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
