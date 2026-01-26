# RetailID Dart SDK

Official Dart SDK for integrating with [Metrc RetailID](https://www.metrc.com/retailid/).

Encode and decode RetailID QR labels to enable product traceability and supply chain visibility in your Dart and Flutter applications.

## Overview

Each RetailID label encodes:
- A **batch ID** (12-byte identifier)
- An **index** (variable-length integer)

These are encoded as compact, URL-safe strings using either Base36 (uppercase) or Base64 (lowercase) format.

## Installation

Add to your `pubspec.yaml`:

```yaml
dependencies:
  dart:
    path: ../dart # Replace with actual dependency if published
```

> **Note**: Replace the path dependency with the published package version when available.

## Quick Start

### Encoding

```dart
import 'package:dart/dart.dart';
import 'package:dart/src/encode_options.dart';
import 'package:dart/src/retail_id.dart';

void main() {
  // Create a batch ID
  final batchId = ObjectId.fromString("ABCDEF012345670000027190");

  // Encode as Base36 (default, uppercase)
  final options = EncodeOptions().setDomain("d.1a4.com");
  final url = RetailId.encode(batchId: batchId, index: 485, options: options);
  // Result: "HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL"

  // Encode as Base64
  final optionsBase64 = EncodeOptions().setBase64(true).setDomain("d.1a4.com");
  final urlBase64 = RetailId.encode(batchId: batchId, index: 485, options: optionsBase64);
  // Result: "https://d.1a4.com/q83vASNFZwAAAnGQ5QM"

  // Custom domain
  final customDomain = EncodeOptions().setDomain("d.1a4.com");
  final urlCustom = RetailId.encode(batchId: batchId, index: 485, options: customDomain);
  // Result: "HTTPS://d.1a4.com/10NOIEYKAJDG6CF0EXGJL"
}
```

### Decoding

```dart
import 'package:dart/dart.dart';
import 'package:dart/src/retail_id.dart';
import 'package:dart/src/retail_id_pair.dart';

void main() {
  // Decode a RetailID URL
  final pair = RetailId.decode("HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL");

  final batchId = pair.batchId;
  final index = pair.index;

  print("Batch ID: $batchId"); // "ABCDEF012345670000027190" (via toString())
  print("Index: $index");      // 485
}
```

### Using RetailIdPair

```dart
import 'package:dart/dart.dart';
import 'package:dart/src/encode_options.dart';
import 'package:dart/src/retail_id_pair.dart';

void main() {
  // Construct from URL
  final pair = RetailIdPair("HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL");

  // Access properties
  final batchId = pair.batchId;
  final index = pair.index;

  // Encode back to URL
  final url = pair.encode();

  // Encode with options
  final options = EncodeOptions().setBase64(true);
  final urlBase64 = pair.encodeRaw(options);
}
```

## API Reference

### `RetailId` Class

Main API for encoding and decoding RetailID URLs.

#### Methods

- `static String encode({required ObjectId batchId, required int index, EncodeOptions? options})`
  - Encodes a RetailID to a URL string.
- `static RetailIdPair decode(String url, {bool strict = false})`
  - Decodes a RetailID URL string to a RetailIdPair.
- `static ParsedId parseUrl(String url, bool strict)`
    - Low-level parsing method.

### `RetailIdPair` Class

Represents a decoded RetailID.

#### Constructors

- `RetailIdPair(String url, {bool strict = false})`
  - Constructs by parsing a URL.
- `RetailIdPair.fromObjectId(ObjectId batchId, int index)`
  - Constructs from batch ID and index.

#### Properties

- `ObjectId batchId`: Returns the batch ID.
- `int index`: Returns the package index.

#### Methods

- `String encode()`: Encodes to URL with default options.
- `String encodeRaw(EncodeOptions options)`: Encodes with custom options.

### `ObjectId` Class

12-byte MongoDB ObjectId implementation.

#### Constructors

- `ObjectId.random()`: Generate random ObjectId.
- `ObjectId.fromString(String hexString)`: From 24-char hex string.
- `ObjectId.fromBytes(Uint8List bytes)`: From 12-byte array.

#### Methods

- `Uint8List id()`: Returns the raw bytes (copy).
- `String toString()`: Converts to hex string.
- `bool operator ==(Object other)`: Equality check.

### `EncodeOptions` Class

Options for encoding RetailID URLs.

#### Methods

- `String get domain`: Get the domain (default: "1a4.com").
- `EncodeOptions setDomain(String newDomain)`: Set custom domain.
- `bool get base64`: Check if using base64 (default: false).
- `EncodeOptions setBase64(bool newBase64)`: Set encoding format.

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
# Get dependencies
dart pub get

# Run tests
dart test
```

## Requirements

- Dart SDK 3.0 or higher

## License

MIT License - Copyright (c) 2025 Metrc LLC

## Support

For issues or questions:
- GitHub Issues: https://github.com/MetrcID/retailid/issues
- Email: dev@metrc.com
