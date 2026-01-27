/// Tests for the RetailID SDK, matching the Python SDK test suite.
library;

import 'dart:typed_data';

import 'package:dart/dart.dart';
import 'package:test/test.dart';

void main() {
  group('ObjectId', () {
    test('Create from hex string', () {
      final oid = ObjectId.fromString('ABCDEF012345670000027190');
      expect(oid.toString(), equals('ABCDEF012345670000027190'));
    });

    test('Create from bytes', () {
      final data = [0xAB, 0xCD, 0xEF, 0x01, 0x23, 0x45, 0x67, 0x00, 0x00, 0x02, 0x71, 0x90];
      final oid = ObjectId.fromBytes(Uint8List.fromList(data));
      expect(oid.toString(), equals('ABCDEF012345670000027190'));
    });

    test('Create random', () {
      final oid = ObjectId.random();
      expect(oid.id().length, equals(12));
      expect(oid.toString().length, equals(24));
    });

    test('Invalid hex length throws error', () {
      expect(() => ObjectId.fromString('1a4060'), throwsArgumentError);
    });

    test('Invalid hex chars throws error', () {
      expect(() => ObjectId.fromString('1a4060300020081000006xyz'), throwsArgumentError);
    });

    test('Invalid bytes length throws error', () {
      expect(() => ObjectId.fromBytes(Uint8List(10)), throwsArgumentError);
    });

    test('Equality', () {
      final oid1 = ObjectId.fromString('ABCDEF012345670000027190');
      final oid2 = ObjectId.fromString('ABCDEF012345670000027190');
      final oid3 = ObjectId.fromString('1A406030003A14E000043614');

      expect(oid1, equals(oid2));
      expect(oid1, isNot(equals(oid3)));
    });

    test('Equals with bytes', () {
      final oid = ObjectId.fromString('ABCDEF012345670000027190');
      final data = [0xAB, 0xCD, 0xEF, 0x01, 0x23, 0x45, 0x67, 0x00, 0x00, 0x02, 0x71, 0x90];
      expect(oid, equals(ObjectId.fromBytes(Uint8List.fromList(data))));
    });
  });

  group('VarInt', () {
    test('Encode/decode small values', () {
      final encoded = VarInt.encode(1);
      expect(encoded.length, equals(1));
      final decoded = VarInt.decode(encoded);
      expect(decoded.value, equals(1));
    });

    test('Encode/decode 128', () {
      final encoded = VarInt.encode(128);
      expect(encoded.length, equals(2));
      final decoded = VarInt.decode(encoded);
      expect(decoded.value, equals(128));
    });

    test('Encode/decode 16384', () {
      final encoded = VarInt.encode(16384);
      expect(encoded.length, equals(3));
      final decoded = VarInt.decode(encoded);
      expect(decoded.value, equals(16384));
    });

    test('VarInt class constructor', () {
      final vi = VarInt.fromValue(128);
      expect(vi.value, equals(128));
      expect(vi.length, equals(2));
    });

    test('VarInt from bytes', () {
      final encoded = VarInt.encode(16384);
      final vi = VarInt.fromBytes(encoded);
      expect(vi.value, equals(16384));
    });
  });

  group('Base36', () {
    test('Encode/decode roundtrip', () {
      final original = [0xAB, 0xCD, 0xEF, 0x01, 0x23, 0x45, 0x67, 0x00, 0x00, 0x02, 0x71, 0x90];
      final encoded = Base36.encode(Uint8List.fromList(original));
      final decoded = Base36.decode(encoded);
      
      // May have different length due to leading zeros
      final origList = Uint8List.fromList(original);
      expect(decoded, anyOf(equals(origList), equals(_stripLeadingZeros(origList))));
    });

    test('Test base36 validation', () {
      expect(Base36.isValid('ABC123'), isTrue);
      expect(Base36.isValid('abc123'), isTrue);
      expect(Base36.isValid('ABC+123'), isFalse);
      expect(Base36.isValid(''), isFalse);
    });
  });

  group('URL64', () {
    test('Decode url64', () {
      expect(UrlEncoder.decodeUrl64('abc-def_ghi'), equals('abc+def/ghi='));
    });

    test('Encode url64', () {
      expect(UrlEncoder.encodeUrl64('abc+def/ghi='), equals('abc-def_ghi'));
    });
  });

  group('Decoding', () {
    // Test case 1: URL with d.1a4.com domain
    test('Decode URL with d.1a4.com domain (index 1)', () {
      const url = 'HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL';
      final pair = RetailIdPair(url);
      
      expect(pair.batchId.toString().toUpperCase(), equals('ABCDEF012345670000027190'));
      expect(pair.index, equals(1));
    });

    // Test cases 2 & 3: URLs with default 1a4.com domain (different batch ID!)
    test('Decode URL with 1a4.com domain (index 128)', () {
      const url = 'HTTPS://1A4.COM/13TX7BMRX3IU01B9EGTPTT';
      final pair = RetailIdPair(url);
      
      expect(pair.batchId.toString().toUpperCase(), equals('1A4060300020081000006609'));
      expect(pair.index, equals(128));
    });

    test('Decode URL with 1a4.com domain (index 16384)', () {
      const url = 'HTTPS://1A4.COM/7V8S42PYJD1XC9C2UVNCD1D';
      final pair = RetailIdPair(url);
      
      expect(pair.batchId.toString().toUpperCase(), equals('1A4060300020081000006609'));
      expect(pair.index, equals(16384));
    });

    test('Decode legacy base64 URL', () {
      const url = 'https://1a4.com/GkBgMAAEG2AAAJKXEQ';
      final pair = RetailIdPair(url);
      
      expect(pair.batchId.toString().toUpperCase(), equals('1A40603000041B6000009297'));
      expect(pair.index, equals(17));
    });
  });

  group('Round-trip encoding', () {
    test('Roundtrip with d.1a4.com domain', () {
      const url = 'HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL';
      final pair = RetailIdPair(url);

      // Re-encode with same domain
      final options = EncodeOptions().setDomain('d.1a4.com');
      final encoded = pair.encodeRaw(options);

      final pair2 = RetailIdPair(encoded);
      expect(pair2.batchId.toString().toUpperCase(), equals('ABCDEF012345670000027190'));
      expect(pair2.index, equals(1));
    });

    test('Roundtrip with default domain', () {
      const url = 'HTTPS://1A4.COM/13TX7BMRX3IU01B9EGTPTT';
      final pair = RetailIdPair(url);

      final encoded = pair.encode();
      final pair2 = RetailIdPair(encoded);
      
      expect(pair2.batchId, equals(pair.batchId));
      expect(pair2.index, equals(pair.index));
    });

    test('Roundtrip legacy base64 via base64', () {
      const url = 'https://1a4.com/GkBgMAAEG2AAAJKXEQ';
      final pair = RetailIdPair(url);

      final options = EncodeOptions().setBase64(true);
      final encoded = pair.encodeRaw(options);

      final pair2 = RetailIdPair(encoded);
      expect(pair2.batchId.toString().toUpperCase(), equals('1A40603000041B6000009297'));
      expect(pair2.index, equals(17));
    });

    test('Roundtrip legacy base64 via base36', () {
      const url = 'https://1a4.com/GkBgMAAEG2AAAJKXEQ';
      final pair = RetailIdPair(url);

      final encoded = pair.encode();

      expect(encoded, startsWith('HTTPS://1A4.COM/'));
      expect(encoded.substring(16), matches(RegExp(r'^[A-Z0-9]+$')));

      final pair2 = RetailIdPair(encoded);
      expect(pair2.batchId.toString().toUpperCase(), equals('1A40603000041B6000009297'));
      expect(pair2.index, equals(17));
    });
  });

  group('Direct encoding', () {
    test('Encode ObjectId and index', () {
      final batchId = ObjectId.fromString('ABCDEF012345670000027190');
      final url = RetailId.encode(batchId: batchId, index: 1);

      expect(url, startsWith('HTTPS://1A4.COM/'));

      final pair = RetailIdPair(url);
      expect(pair.batchId.toString().toUpperCase(), equals('ABCDEF012345670000027190'));
      expect(pair.index, equals(1));
    });

    test('Base36 is default', () {
      final batchId = ObjectId.fromString('ABCDEF012345670000027190');
      final url = RetailId.encode(batchId: batchId, index: 1);

      expect(url, startsWith('HTTPS://1A4.COM/'));
      final dataPart = url.split('/').last;
      expect(dataPart, matches(RegExp(r'^[A-Z0-9]+$')));
    });

    test('Base64 when requested', () {
      final batchId = ObjectId.fromString('ABCDEF012345670000027190');
      final options = EncodeOptions().setBase64(true);
      final url = RetailId.encode(batchId: batchId, index: 1, options: options);

      expect(url, startsWith('https://1a4.com/'));
      final dataPart = url.split('/').last;
      expect(dataPart.contains('+'), isFalse);
      expect(dataPart.contains('/'), isFalse);
      expect(dataPart.contains('='), isFalse);
    });
  });

  group('Edge cases', () {
    test('Invalid URL throws error', () {
      expect(() => RetailIdPair('invalid_garbage'), throwsArgumentError);
    });

    test('Empty path throws error', () {
      expect(() => RetailIdPair('https://1a4.com/'), throwsArgumentError);
    });

    test('Shortcode only', () {
      final pair = RetailIdPair('10NOIEYKAJDG6CF0EXGJL');
      expect(pair.batchId.toString().toUpperCase(), equals('ABCDEF012345670000027190'));
      expect(pair.index, equals(1));
    });
  });
}

Uint8List _stripLeadingZeros(Uint8List bytes) {
  var start = 0;
  while (start < bytes.length && bytes[start] == 0) {
    start++;
  }
  return Uint8List.fromList(bytes.sublist(start));
}
