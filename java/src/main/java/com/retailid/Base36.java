package com.retailid;

import java.math.BigInteger;

/**
 * Base36 encoding and decoding utilities.
 *
 * <p>Base36 uses digits 0-9 and letters A-Z (case-insensitive) to represent
 * data in a compact, URL-safe format. This implementation produces uppercase
 * output by default.
 *
 * <p>Example usage:
 * <pre>
 * byte[] data = {0x1a, 0x40, 0x60, 0x30};
 * String encoded = Base36.encode(data);  // "5LN8CBN"
 * byte[] decoded = Base36.decode(encoded);
 * </pre>
 *
 * @author Metrc LLC
 */
public class Base36 {

    /**
     * Encodes a byte array to a Base36 string (uppercase).
     *
     * @param bytes the bytes to encode
     * @return the Base36 encoded string
     * @throws IllegalArgumentException if bytes is null
     */
    public static String encode(byte[] bytes) {
        if (bytes == null) {
            throw new IllegalArgumentException("Bytes cannot be null");
        }
        if (bytes.length == 0) {
            return "";
        }
        // Use BigInteger with signum 1 to treat as unsigned
        return new BigInteger(1, bytes).toString(36).toUpperCase();
    }

    /**
     * Decodes a Base36 string to a byte array.
     *
     * @param base36 the Base36 string to decode (case-insensitive)
     * @return the decoded bytes
     * @throws IllegalArgumentException if the string is null or contains invalid characters
     */
    public static byte[] decode(String base36) {
        if (base36 == null) {
            throw new IllegalArgumentException("Base36 string cannot be null");
        }
        if (base36.isEmpty()) {
            return new byte[0];
        }
        if (!isValid(base36)) {
            throw new IllegalArgumentException("Invalid Base36 string: contains non-alphanumeric characters");
        }

        // Base36 is case-insensitive, convert to lowercase for BigInteger
        BigInteger bigInt = new BigInteger(base36.toLowerCase(), 36);
        byte[] bytes = bigInt.toByteArray();

        // BigInteger.toByteArray() may add a leading zero byte for positive numbers
        // to indicate the sign. We need to remove it if present.
        if (bytes.length > 1 && bytes[0] == 0) {
            byte[] trimmed = new byte[bytes.length - 1];
            System.arraycopy(bytes, 1, trimmed, 0, trimmed.length);
            return trimmed;
        }

        return bytes;
    }

    /**
     * Tests if a string is valid Base36 (contains only alphanumeric characters).
     *
     * @param base36 the string to test
     * @return true if the string is valid Base36
     */
    public static boolean isValid(String base36) {
        if (base36 == null || base36.isEmpty()) {
            return false;
        }
        return base36.matches("^[0-9A-Za-z]+$");
    }
}
