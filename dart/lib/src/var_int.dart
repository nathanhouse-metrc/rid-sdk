import 'dart:typed_data';

import 'package:convert/convert.dart';
import 'package:dart/src/extensions.dart';
import 'package:equatable/equatable.dart';

final class DecodeResult {
  const DecodeResult({
    required this.value,
    required this.length,
    required this.bytes,
  });

  final int value;
  final int length;
  final Uint8List bytes;
}

final class VarInt extends Equatable {
  static Uint8List encode(int value) {
    if (value.isNegative) {
      throw ArgumentError('VarInt does not support negative values: $value');
    }
    var tempNum = value;
    var byteCount = 0;
    do {
      byteCount++;
      tempNum >>>= 7;
    } while (tempNum != 0);
    final result = Uint8List(byteCount);
    var index = 0;
    while (value >= 0x80) {
      result[index++] = ((value & 0x7F) | 0x80);
      value >>>= 7;
    }
    result[index] = value;
    return result;
  }

  static DecodeResult decodeRaw(Uint8List source, int offset) {
    var value = 0;
    var shift = 0;
    var length = 0;
    while (true) {
      if (offset + length >= source.length) {
        throw ArgumentError(
          'VarInt decode: buffer underflow (need more bytes)',
        );
      }
      var b = source[offset + length];
      value |= (b & 0x7F) << shift;
      length++;
      if ((b & 0x80) == 0) {
        break;
      }
      shift += 7;
      if (shift >= 32) {
        throw ArgumentError('VarInt decode: value too large (overflow)');
      }
    }
    return DecodeResult(
      value: value,
      length: length,
      bytes: source.sublist(offset, offset + length),
    );
  }

  static DecodeResult decode(Uint8List source) {
    return decodeRaw(source, 0);
  }

  VarInt.fromValue(this.value) {
    if (value.isNegative) {
      throw ArgumentError('VarInt does not support negative values: $value');
    }
    _bytes = encode(value);
  }

  VarInt.fromBytes(Uint8List bytes) {
    if (bytes.isEmpty) {
      throw ArgumentError('VarInt source cannot be empty');
    }
    try {
      final result = decodeRaw(bytes, 0);
      value = result.value;
      _bytes = result.bytes;
    } catch (e) {
      throw ArgumentError('Failed to construct VarInt: $e');
    }
  }

  late final Uint8List _bytes;
  late final int value;

  int get length => _bytes.length;

  @override
  List<Object?> get props => [_bytes, value];

  Uint8List data() => _bytes.copy();

  String toHexString() => hex.encode(_bytes);

  @override
  String toString() => '0x${toHexString()}';
}
