import 'dart:typed_data';

extension Uint8ListX on Uint8List {
  Uint8List copy() => sublist(0, length);
}
