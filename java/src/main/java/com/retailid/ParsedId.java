package com.retailid;

/**
 * Internal class representing a parsed RetailID.
 *
 * <p>This is used internally by the RetailId decoder to return
 * both the batchId and index from parsing operations.
 *
 * @author Metrc LLC
 */
class ParsedId {
    final ObjectId batchId;
    final int index;

    ParsedId(ObjectId batchId, int index) {
        this.batchId = batchId;
        this.index = index;
    }
}
