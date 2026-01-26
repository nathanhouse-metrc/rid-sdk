final class EncodeOptions {
  var _domain = '1a4.com';
  var _base64 = false;

  String get domain => _domain;

  bool get base64 => _base64;

  EncodeOptions setDomain(String newDomain) {
    _domain = newDomain;
    return this;
  }

  EncodeOptions setBase64(bool newBase64) {
    _base64 = newBase64;
    return this;
  }
}
