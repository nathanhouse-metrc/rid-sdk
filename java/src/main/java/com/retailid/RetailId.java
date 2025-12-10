package com.retailid;

import java.util.Arrays;

/**
 * Main API for encoding and decoding RetailID URLs.
 *
 * <p>RetailID is a supply chain package tracking system that uses QR codes
 * to uniquely identify packages. Each RetailID consists of:
 * <ul>
 *   <li>A batch ID (12-byte ObjectId)</li>
 *   <li>An index (variable-length integer)</li>
 * </ul>
 *
 * <p>These are encoded as URL-safe strings using either Base36 (uppercase)
 * or Base64 (lowercase) encoding.
 *
 * <p>Example usage:
 * <pre>
 * // Encoding
 * ObjectId batchId = new ObjectId("1a4060300020081000006609");
 * String url = RetailId.encode(batchId, 1);
 * // Result: "HTTPS://1A4.COM/5LN8CBN1UB33DON9CHKX"
 *
 * // Decoding
 * RetailIdPair pair = RetailId.decode("HTTPS://1A4.COM/5LN8CBN1UB33DON9CHKX");
 * ObjectId decoded = pair.getBatchId();
 * int index = pair.getIndex();
 * </pre>
 *
 * @author Metrc LLC
 */
public class RetailId {

    // Known RetailID prefixes (in hex)
    private static final String[] KNOWN_PREFIXES = {"1a4", "abc"};

    // Valid ObjectId timestamp range: 2012-01-01 to 2052-01-01 (Unix timestamps in seconds)
    private static final long MIN_OBJECTID_TIMESTAMP = 1325376000L; // 2012-01-01
    private static final long MAX_OBJECTID_TIMESTAMP = 2588294400L; // 2052-01-01

    /**
     * Encodes a RetailID to a URL string with default options (base36, uppercase, 1a4.com).
     *
     * @param batchId the batch ObjectId
     * @param index the package index
     * @return the encoded URL string
     */
    public static String encode(ObjectId batchId, int index) {
        return encode(batchId, index, new EncodeOptions());
    }

    /**
     * Encodes a RetailID to a URL string with specified options.
     *
     * @param batchId the batch ObjectId
     * @param index the package index
     * @param options the encoding options
     * @return the encoded URL string
     */
    public static String encode(ObjectId batchId, int index, EncodeOptions options) {
        if (batchId == null) {
            throw new IllegalArgumentException("Batch ID cannot be null");
        }
        if (index < 0) {
            throw new IllegalArgumentException("Index cannot be negative: " + index);
        }
        if (options == null) {
            options = new EncodeOptions();
        }

        // Create buffer: batchId (12 bytes) + varint-encoded index
        byte[] batchBytes = batchId.getId();
        byte[] indexBytes = VarInt.encode(index);
        byte[] buffer = new byte[batchBytes.length + indexBytes.length];
        System.arraycopy(batchBytes, 0, buffer, 0, batchBytes.length);
        System.arraycopy(indexBytes, 0, buffer, batchBytes.length, indexBytes.length);

        String domain = options.getDomain();
        if (options.isBase64()) {
            // Base64 encoding: lowercase URL
            String encoded = UrlEncoder.bytesToUrlBase64(buffer);
            return "https://" + domain + "/" + encoded;
        } else {
            // Base36 encoding: uppercase URL
            String encoded = Base36.encode(buffer);
            return "HTTPS://" + domain.toUpperCase() + "/" + encoded;
        }
    }

    /**
     * Decodes a RetailID URL string to a RetailIdPair.
     *
     * @param url the URL to decode
     * @return the decoded RetailIdPair
     * @throws IllegalArgumentException if the URL is invalid
     */
    public static RetailIdPair decode(String url) {
        return decode(url, false);
    }

    /**
     * Decodes a RetailID URL string to a RetailIdPair with optional strict mode.
     *
     * @param url the URL to decode
     * @param strict if true, only accept URLs with known prefixes
     * @return the decoded RetailIdPair
     * @throws IllegalArgumentException if the URL is invalid
     */
    public static RetailIdPair decode(String url, boolean strict) {
        ParsedId parsed = parseUrl(url, strict);
        return new RetailIdPair(parsed.batchId, parsed.index);
    }

    /**
     * Internal method to parse a URL and extract batchId and index.
     */
    static ParsedId parseUrl(String url, boolean strict) {
        if (url == null || url.isEmpty()) {
            throw new IllegalArgumentException("URL cannot be null or empty");
        }

        // Extract the short code from the URL
        String shortCode = extractShortCode(url);

        // Determine if the shortcode is all uppercase (could be base36)
        boolean isAllUppercase = shortCode.equals(shortCode.toUpperCase());

        // Try parsing with different strategies
        // This matches the JavaScript SDK logic for handling both uppercase and lowercase base36

        // Strategy 1: Try base36 with strict validation (known prefixes)
        // Base36 is case-insensitive, so try it for any valid base36 string
        if (Base36.isValid(shortCode)) {
            try {
                byte[] buffer = Base36.decode(shortCode);
                ParsedId result = parseBatchIdAndIndex(buffer, ValidationMode.STRICT);
                if (result != null) return result;
            } catch (Exception ignored) {
                // Try next strategy
            }
        }

        // Strategy 2: Try base64 with strict validation (known prefixes)
        try {
            byte[] buffer = UrlEncoder.urlBase64ToBytes(shortCode);
            ParsedId result = parseBatchIdAndIndex(buffer, ValidationMode.STRICT);
            if (result != null) return result;
        } catch (Exception ignored) {
            // Try next strategy
        }

        // Strategy 3: Try base36 with mongo timestamp validation or permissive mode
        // Only try if uppercase (avoid ambiguity with base64)
        if (isAllUppercase && Base36.isValid(shortCode)) {
            try {
                byte[] buffer = Base36.decode(shortCode);
                ParsedId result = parseBatchIdAndIndex(buffer, strict ? ValidationMode.MONGO : ValidationMode.ANY);
                if (result != null) return result;
            } catch (Exception ignored) {
                // Try next strategy
            }
        }

        // Strategy 4: Try base64 with mongo timestamp validation or permissive mode
        try {
            byte[] buffer = UrlEncoder.urlBase64ToBytes(shortCode);
            ParsedId result = parseBatchIdAndIndex(buffer, strict ? ValidationMode.MONGO : ValidationMode.ANY);
            if (result != null) return result;
        } catch (Exception ignored) {
            // All strategies failed
        }

        throw new IllegalArgumentException("Unrecognized URL: " + url);
    }

    /**
     * Extracts the short code from a RetailID URL.
     */
    private static String extractShortCode(String url) {
        if (url.toLowerCase().contains("http")) {
            // Parse as URL: protocol://domain/path
            String[] parts = url.split("//", 2);
            if (parts.length < 2) {
                throw new IllegalArgumentException("Invalid URL format: " + url);
            }

            String remainder = parts[1];
            String[] pathParts = remainder.split("/");
            if (pathParts.length < 2) {
                throw new IllegalArgumentException("No path found in URL: " + url);
            }

            String shortCode = pathParts[pathParts.length - 1];
            if (shortCode.isEmpty()) {
                throw new IllegalArgumentException("No short code found in URL: " + url);
            }

            return shortCode;
        } else {
            // Assume it's just the short code
            return url;
        }
    }

    /**
     * Validation modes for parsing.
     */
    private enum ValidationMode {
        STRICT,  // Only known prefixes
        MONGO,   // Valid MongoDB timestamp
        ANY      // No validation
    }

    /**
     * Parses a buffer to extract batchId and index with validation.
     */
    private static ParsedId parseBatchIdAndIndex(byte[] buffer, ValidationMode mode) {
        if (buffer.length < 13) {
            return null; // Too short
        }

        // Extract the 12-byte ObjectId
        byte[] idBytes = Arrays.copyOfRange(buffer, 0, 12);
        String hexId = bytesToHex(idBytes);

        // Validate based on mode
        if (mode == ValidationMode.STRICT) {
            if (!hasKnownPrefix(hexId)) {
                return null;
            }
        } else if (mode == ValidationMode.MONGO) {
            if (!hasKnownPrefix(hexId) && !isValidObjectIdTimestamp(idBytes)) {
                return null;
            }
        }
        // ValidationMode.ANY: no validation

        // Create ObjectId
        ObjectId batchId;
        try {
            batchId = new ObjectId(hexId);
        } catch (Exception e) {
            return null;
        }

        // Decode the varint index
        byte[] indexBytes = Arrays.copyOfRange(buffer, 12, buffer.length);
        try {
            VarInt.DecodeResult result = VarInt.decode(indexBytes);
            return new ParsedId(batchId, result.value);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Checks if a hex ObjectId starts with a known prefix.
     */
    private static boolean hasKnownPrefix(String hexId) {
        for (String prefix : KNOWN_PREFIXES) {
            if (hexId.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Validates that the first 4 bytes represent a valid MongoDB timestamp (2012-2052).
     */
    private static boolean isValidObjectIdTimestamp(byte[] bytes) {
        if (bytes.length < 4) {
            return false;
        }

        // First 4 bytes are big-endian Unix timestamp in seconds
        long timestamp = ((bytes[0] & 0xFFL) << 24) |
                        ((bytes[1] & 0xFFL) << 16) |
                        ((bytes[2] & 0xFFL) << 8) |
                        (bytes[3] & 0xFFL);

        return timestamp >= MIN_OBJECTID_TIMESTAMP && timestamp <= MAX_OBJECTID_TIMESTAMP;
    }

    /**
     * Converts bytes to hex string.
     */
    private static String bytesToHex(byte[] bytes) {
        StringBuilder hex = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            hex.append(String.format("%02x", b & 0xFF));
        }
        return hex.toString();
    }
}
