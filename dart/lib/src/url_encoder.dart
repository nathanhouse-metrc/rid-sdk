import 'dart:convert';
import 'dart:typed_data';

final class UrlEncoder {
  static String encodeUrl64(String base64) =>
      base64.replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_');

  static String decodeUrl64(String encoded) {
    var base64 = encoded.replaceAll('-', '+').replaceAll('_', '/');
    final padding = (4 - (base64.length % 4)) % 4;
    for (var i = 0; i < padding; i++) {
      base64 += '=';
    }
    return base64;
  }

  static String bytesToUrlBase64(Uint8List bytes) {
    final base64 = base64Encode(bytes);
    return encodeUrl64(base64);
  }

  static Uint8List urlBase64ToBytes(String urlBase64) {
    final standard = decodeUrl64(urlBase64);
    return base64Decode(standard);
  }
}
