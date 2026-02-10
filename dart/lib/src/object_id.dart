import 'dart:math';
import 'dart:typed_data';

import 'package:convert/convert.dart';
import 'package:dart/src/extensions.dart';
import 'package:equatable/equatable.dart';

final class ObjectId extends Equatable {
  static final Random _random = Random.secure();

  late final Uint8List _bytes;

  ObjectId.random() {
    _bytes = Uint8List.fromList(List.generate(12, (_) => _random.nextInt(256)));
  }

  ObjectId.fromString(String hexString) {
    if (hexString.length != 24) {
      throw ArgumentError(
        'Invalid ObjectId hex string: expected 24 characters, got ${hexString.length}',
      );
    }
    final regex = RegExp(r'^[0-9a-fA-F]+$');
    if (!regex.hasMatch(hexString)) {
      throw ArgumentError(
        'Invalid ObjectId hex string: must contain only hex characters (0-9, a-f, A-F)',
      );
    }
    _bytes = Uint8List.fromList(hex.decode(hexString));
  }

  ObjectId.fromBytes(Uint8List bytes) {
    if (bytes.length != 12) {
      throw ArgumentError(
        'Invalid ObjectId bytes length: expected 12 bytes, got ${bytes.length}',
      );
    }
    _bytes = bytes.copy();
  }

  Uint8List id() => _bytes.copy();

  @override
  String toString() => hex.encode(_bytes).toUpperCase();

  @override
  List<Object?> get props => [_bytes];
}
