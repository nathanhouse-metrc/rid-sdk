import 'dart:typed_data';

import 'package:convert/convert.dart';
import 'package:dart/dart.dart';

enum _ValidationMode { strict, mongo, any }

final class RetailId {
  static const Set<String> _knownPrefixes = {'1a4', 'abc'};
  static const int minObjectIdTimestamp = 1325376000;
  static const int maxObjectIdTimestamp = 2588294400;

  static String encode({
    required ObjectId batchId,
    required int index,
    EncodeOptions? options,
  }) {
    options ??= EncodeOptions();
    final batchBytes = batchId.id();
    final indexBytes = VarInt.encode(index);
    final buffer = Uint8List(batchBytes.length + indexBytes.length);
    buffer.setAll(0, batchBytes);
    buffer.setAll(batchBytes.length, indexBytes);
    final domain = options.domain;
    if (options.base64) {
      final encoded = UrlEncoder.bytesToUrlBase64(buffer);
      return 'https://$domain/$encoded';
    } else {
      final encoded = Base36.encode(buffer);
      return 'HTTPS://${domain.toUpperCase()}/$encoded';
    }
  }

  // TODO retail id pair functions

  static ParsedId parseUrl(String url, bool strict) {
    if (url.isEmpty) {
      throw ArgumentError('URL cannot be empty');
    }
    final shortCode = _extractShortCode(url);
    final isAllUppercase = shortCode == shortCode.toUpperCase();
    // strategy #1
    if (Base36.isValid(shortCode)) {
      try {
        final buffer = Base36.decode(shortCode);
        final result = _parseBatchIdAndIndex(buffer, _ValidationMode.strict);
        if (result != null) return result;
      } catch (_) {
        // Try next strategy
      }
    }
    // strategy #2
    try {
      final buffer = UrlEncoder.urlBase64ToBytes(shortCode);
      final result = _parseBatchIdAndIndex(buffer, _ValidationMode.strict);
      if (result != null) return result;
    } catch (e) {
      // try next strategy
    }
    // strategy #3
    try {
      final buffer = Base36.decode(shortCode);
      final result = _parseBatchIdAndIndex(
        buffer,
        isAllUppercase ? _ValidationMode.mongo : _ValidationMode.any,
      );
      if (result != null) return result;
    } catch (e) {
      // try next strategy
    }
    // strategy #4
    try {
      final buffer = UrlEncoder.urlBase64ToBytes(shortCode);
      final result = _parseBatchIdAndIndex(
        buffer,
        strict ? _ValidationMode.mongo : _ValidationMode.any,
      );
      if (result != null) return result;
    } catch (e) {
      // all strategies failed
    }
    throw ArgumentError('Unrecognized URL: $url');
  }

  static RetailIdPair decode(String url, {bool strict = false}) {
    final parsed = parseUrl(url, strict);
    return RetailIdPair.fromObjectId(parsed.batchId, parsed.index);
  }

  static String _extractShortCode(String url) {
    if (url.toLowerCase().contains('http')) {
      final parts = url.split('//');
      if (parts.length < 2) {
        throw ArgumentError('Invalid URL: $url');
      }
      final remainder = parts[1];
      final pathParts = remainder.split('/');
      if (pathParts.length < 2) {
        throw ArgumentError('No path found in URL: $url');
      }
      final shortCode = pathParts[pathParts.length - 1];
      if (shortCode.isEmpty) {
        throw ArgumentError('No short code found in URL: $url');
      }
      return shortCode;
    } else {
      return url;
    }
  }

  static ParsedId? _parseBatchIdAndIndex(
    Uint8List buffer,
    _ValidationMode mode,
  ) {
    if (buffer.length < 13) {
      return null;
    }
    final idBytes = buffer.sublist(0, 12);
    final hexId = _bytesToHex(idBytes);
    switch (mode) {
      case _ValidationMode.strict:
        if (!_hasKnownPrefix(hexId)) {
          return null;
        }
      case _ValidationMode.mongo:
        if (!_hasKnownPrefix(hexId) && !_isValidObjectIdTimestamp(idBytes)) {
          return null;
        }
      case _ValidationMode.any:
    }
    late final ObjectId batchId;
    try {
      batchId = ObjectId.fromString(hexId);
    } catch (e) {
      return null;
    }
    final indexBytes = buffer.sublist(12);
    try {
      final result = VarInt.decode(indexBytes);
      return ParsedId(batchId, result.value);
    } catch (e) {
      return null;
    }
  }

  static String _bytesToHex(Uint8List bytes) => hex.encode(bytes);

  static bool _hasKnownPrefix(String hexId) =>
      _knownPrefixes.any((prefix) => hexId.startsWith(prefix));

  static bool _isValidObjectIdTimestamp(Uint8List bytes) {
    if (bytes.length < 4) {
      return false;
    }
    final timestamp = ((bytes[0] & 0xFF) << 24) |
        ((bytes[1] & 0xFF) << 16) |
        ((bytes[2] & 0xFF) << 8) |
        (bytes[3] & 0xFF);
    return timestamp >= minObjectIdTimestamp &&
        timestamp <= maxObjectIdTimestamp;
  }
}
