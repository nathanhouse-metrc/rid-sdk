package com.retailid;

import java.security.SecureRandom;
import java.util.Arrays;

/**
 * Minimal ObjectId implementation compatible with MongoDB ObjectIds.
 *
 * <p>An ObjectId is a 12-byte identifier typically represented as a 24-character hexadecimal string.
 * The first 4 bytes represent a timestamp, making ObjectIds roughly sortable by creation time.
 *
 * <p>Example usage:
 * <pre>
 * // Create from hex string
 * ObjectId id1 = new ObjectId("1a4060300020081000006609");
 *
 * // Generate new random ObjectId
 * ObjectId id2 = new ObjectId();
 *
 * // Get hex string representation
 * String hex = id1.toHexString();
 *
 * // Compare ObjectIds
 * boolean equal = id1.equals(id2);
 * </pre>
 *
 * @author Metrc LLC
 */
public class ObjectId {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final byte[] bytes;

    /**
     * Constructs a new ObjectId with random bytes.
     */
    public ObjectId() {
        this.bytes = new byte[12];
        RANDOM.nextBytes(this.bytes);
    }

    /**
     * Constructs an ObjectId from a 24-character hexadecimal string.
     *
     * @param hexString the hex string (must be 24 characters, 0-9 a-f A-F)
     * @throws IllegalArgumentException if the hex string is invalid
     */
    public ObjectId(String hexString) {
        if (hexString == null) {
            throw new IllegalArgumentException("ObjectId hex string cannot be null");
        }
        if (hexString.length() != 24) {
            throw new IllegalArgumentException(
                "Invalid ObjectId hex string: expected 24 characters, got " + hexString.length()
            );
        }
        if (!hexString.matches("^[0-9a-fA-F]+$")) {
            throw new IllegalArgumentException(
                "Invalid ObjectId hex string: must contain only hex characters (0-9, a-f, A-F)"
            );
        }
        this.bytes = hexToBytes(hexString);
    }

    /**
     * Constructs an ObjectId from a 12-byte array.
     *
     * @param bytes the byte array (must be 12 bytes)
     * @throws IllegalArgumentException if the byte array is not 12 bytes
     */
    public ObjectId(byte[] bytes) {
        if (bytes == null) {
            throw new IllegalArgumentException("ObjectId bytes cannot be null");
        }
        if (bytes.length != 12) {
            throw new IllegalArgumentException(
                "Invalid ObjectId bytes length: expected 12 bytes, got " + bytes.length
            );
        }
        this.bytes = Arrays.copyOf(bytes, 12);
    }

    /**
     * Returns the raw 12-byte representation of this ObjectId.
     *
     * @return a copy of the internal byte array
     */
    public byte[] getId() {
        return Arrays.copyOf(bytes, 12);
    }

    /**
     * Converts this ObjectId to a 24-character hexadecimal string.
     *
     * @return the hex string representation
     */
    public String toHexString() {
        return bytesToHex(bytes);
    }

    /**
     * Returns the hex string representation (same as toHexString()).
     *
     * @return the hex string representation
     */
    @Override
    public String toString() {
        return toHexString();
    }

    /**
     * Compares this ObjectId to another ObjectId or byte array for equality.
     *
     * @param other another ObjectId or byte array
     * @return true if the bytes are equal
     */
    public boolean equals(Object other) {
        if (this == other) return true;
        if (other == null) return false;

        if (other instanceof ObjectId) {
            return Arrays.equals(this.bytes, ((ObjectId) other).bytes);
        } else if (other instanceof byte[]) {
            return Arrays.equals(this.bytes, (byte[]) other);
        }
        return false;
    }

    @Override
    public int hashCode() {
        return Arrays.hashCode(bytes);
    }

    /**
     * Converts a hexadecimal string to a byte array.
     */
    private static byte[] hexToBytes(String hex) {
        byte[] bytes = new byte[hex.length() / 2];
        for (int i = 0; i < bytes.length; i++) {
            int index = i * 2;
            bytes[i] = (byte) Integer.parseInt(hex.substring(index, index + 2), 16);
        }
        return bytes;
    }

    /**
     * Converts a byte array to a hexadecimal string.
     */
    private static String bytesToHex(byte[] bytes) {
        StringBuilder hex = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            hex.append(String.format("%02x", b & 0xFF));
        }
        return hex.toString();
    }
}
