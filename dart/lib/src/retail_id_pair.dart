import 'package:dart/dart.dart';
import 'package:dart/src/encode_options.dart';
import 'package:dart/src/retail_id.dart';
import 'package:equatable/equatable.dart';

final class RetailIdPair extends Equatable {
  RetailIdPair(String url, {bool strict = false}) {
    final parsed = RetailId.parseUrl(url, strict);
    batchId = parsed.batchId;
    index = parsed.index;
  }

  RetailIdPair.fromObjectId(this.batchId, this.index) {
    if (index.isNegative) {
      throw ArgumentError('Index cannot be negative');
    }
  }

  late final ObjectId batchId;
  late final int index;

  String encode() => encodeRaw(EncodeOptions());

  String encodeRaw(EncodeOptions options) =>
      RetailId.encode(batchId: batchId, index: index, options: options);

  @override
  bool get stringify => true;

  @override
  List<Object?> get props => [batchId, index];
}
