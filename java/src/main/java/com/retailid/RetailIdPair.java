package com.retailid;

/**
 * Represents a decoded RetailID consisting of a batch ID and an index.
 *
 * <p>A RetailID pair uniquely identifies a package in the RetailID system.
 * The batch ID is represented as an ObjectId (12 bytes), and the index
 * is a variable-length integer.
 *
 * <p>Example usage:
 * <pre>
 * // Decode from URL
 * RetailIdPair pair = new RetailIdPair("HTTPS://1A4.COM/5LN8CBN1UB33DON9CHKX");
 * ObjectId batchId = pair.getBatchId();
 * int index = pair.getIndex();
 *
 * // Encode back to URL
 * String url = pair.encode();
 * String base64Url = pair.encode(new EncodeOptions().setBase64(true));
 * </pre>
 *
 * @author Metrc LLC
 */
public class RetailIdPair {
    private final ObjectId batchId;
    private final int index;

    /**
     * Constructs a RetailIdPair by parsing a URL string.
     *
     * @param url the RetailID URL to parse
     * @throws IllegalArgumentException if the URL is invalid
     */
    public RetailIdPair(String url) {
        this(url, false);
    }

    /**
     * Constructs a RetailIdPair by parsing a URL string with optional strict mode.
     *
     * @param url the RetailID URL to parse
     * @param strict if true, only accept URLs with known prefixes (1a4, abc)
     * @throws IllegalArgumentException if the URL is invalid
     */
    public RetailIdPair(String url, boolean strict) {
        ParsedId parsed = RetailId.parseUrl(url, strict);
        this.batchId = parsed.batchId;
        this.index = parsed.index;
    }

    /**
     * Constructs a RetailIdPair from a batch ID and index.
     *
     * @param batchId the batch ObjectId
     * @param index the package index
     * @throws IllegalArgumentException if batchId is null or index is negative
     */
    public RetailIdPair(ObjectId batchId, int index) {
        if (batchId == null) {
            throw new IllegalArgumentException("Batch ID cannot be null");
        }
        if (index < 0) {
            throw new IllegalArgumentException("Index cannot be negative");
        }
        this.batchId = batchId;
        this.index = index;
    }

    /**
     * Returns the batch ID (ObjectId).
     *
     * @return the batch ID
     */
    public ObjectId getBatchId() {
        return batchId;
    }

    /**
     * Returns the package index.
     *
     * @return the index
     */
    public int getIndex() {
        return index;
    }

    /**
     * Encodes this RetailIdPair to a URL string with default options (base36, uppercase).
     *
     * @return the encoded URL string
     */
    public String encode() {
        return encode(new EncodeOptions());
    }

    /**
     * Encodes this RetailIdPair to a URL string with the specified options.
     *
     * @param options the encoding options
     * @return the encoded URL string
     */
    public String encode(EncodeOptions options) {
        return RetailId.encode(batchId, index, options);
    }

    @Override
    public String toString() {
        return "RetailIdPair{batchId=" + batchId.toHexString() + ", index=" + index + "}";
    }

    @Override
    public boolean equals(Object obj) {
        if (this == obj) return true;
        if (!(obj instanceof RetailIdPair)) return false;
        RetailIdPair other = (RetailIdPair) obj;
        return index == other.index && batchId.equals(other.batchId);
    }

    @Override
    public int hashCode() {
        return 31 * batchId.hashCode() + index;
    }
}
