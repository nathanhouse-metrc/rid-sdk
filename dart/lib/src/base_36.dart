import 'dart:typed_data';

import 'package:convert/convert.dart';

final class Base36 {
  static String encode(Uint8List bytes) {
    if (bytes.isEmpty) return '';
    final hexString = hex.encode(bytes);
    return BigInt.parse(hexString, radix: 16).toRadixString(36).toUpperCase();
  }

  static Uint8List decode(String base36) {
    if (base36.isEmpty) return Uint8List(0);
    if (!isValid(base36)) {
      throw ArgumentError(
        'Invalid Base36 string: contains non-alphanumeric characters',
      );
    }
    final bigInt = BigInt.parse(base36.toLowerCase(), radix: 36);
    final bytes = hex.decode(bigInt.toRadixString(16));
    return Uint8List.fromList(bytes);
  }

  static bool isValid(String base36) {
    if (base36.isEmpty) {
      return false;
    }
    return RegExp(r'^[0-9A-Za-z]+$').hasMatch(base36);
  }
}
