package com.retailid;

import java.util.Arrays;

/**
 * Variable-length integer encoding using LEB128 unsigned format.
 *
 * <p>This implementation uses the unsigned LEB128 (Little Endian Base 128) encoding:
 * <ul>
 *   <li>Values &lt; 128: 1 byte</li>
 *   <li>Values &gt;= 128 and &lt; 16384: 2 bytes</li>
 *   <li>Values &gt;= 16384: 3+ bytes</li>
 * </ul>
 *
 * <p>Each byte uses 7 bits for data and 1 bit (MSB) as a continuation flag.
 * If the MSB is set (0x80), more bytes follow.
 *
 * <p>Example usage:
 * <pre>
 * // Encode
 * byte[] encoded = VarInt.encode(128);
 *
 * // Decode
 * VarInt.DecodeResult result = VarInt.decode(encoded);
 * int value = result.value;
 * int bytesRead = result.length;
 *
 * // Using constructor
 * VarInt v1 = new VarInt(128);
 * VarInt v2 = new VarInt(encoded);
 * </pre>
 *
 * @author Metrc LLC
 */
public class VarInt {
    private final byte[] bytes;
    private final int value;

    /**
     * Result of decoding a varint, containing the value and number of bytes read.
     */
    public static class DecodeResult {
        public final int value;
        public final int length;
        public final byte[] bytes;

        DecodeResult(int value, int length, byte[] bytes) {
            this.value = value;
            this.length = length;
            this.bytes = bytes;
        }
    }

    /**
     * Constructs a VarInt from an integer value.
     *
     * @param value the integer to encode
     * @throws IllegalArgumentException if value is negative
     */
    public VarInt(int value) {
        if (value < 0) {
            throw new IllegalArgumentException("VarInt does not support negative values: " + value);
        }
        this.value = value;
        this.bytes = encode(value);
    }

    /**
     * Constructs a VarInt by decoding from a byte array.
     *
     * @param source the byte array to decode from
     * @throws IllegalArgumentException if decoding fails
     */
    public VarInt(byte[] source) {
        if (source == null || source.length == 0) {
            throw new IllegalArgumentException("VarInt source cannot be null or empty");
        }
        try {
            DecodeResult result = decode(source, 0);
            this.value = result.value;
            this.bytes = result.bytes;
        } catch (Exception e) {
            throw new IllegalArgumentException("Failed to construct VarInt: " + e.getMessage(), e);
        }
    }

    /**
     * Encodes an integer as a varint byte array.
     *
     * @param num the integer to encode (must be non-negative)
     * @return the encoded bytes
     */
    public static byte[] encode(int num) {
        if (num < 0) {
            throw new IllegalArgumentException("VarInt does not support negative values: " + num);
        }

        // Calculate how many bytes we need
        int tempNum = num;
        int byteCount = 0;
        do {
            byteCount++;
            tempNum >>>= 7;
        } while (tempNum != 0);

        byte[] result = new byte[byteCount];
        int index = 0;

        while (num >= 0x80) {
            result[index++] = (byte) ((num & 0x7F) | 0x80);
            num >>>= 7;
        }
        result[index] = (byte) num;

        return result;
    }

    /**
     * Decodes a varint from a byte array starting at the given offset.
     *
     * @param source the byte array to decode from
     * @param offset the starting offset in the array
     * @return the decode result containing value, length, and bytes
     * @throws IllegalArgumentException if the buffer is too short or format is invalid
     */
    public static DecodeResult decode(byte[] source, int offset) {
        if (source == null) {
            throw new IllegalArgumentException("VarInt source cannot be null");
        }

        int value = 0;
        int shift = 0;
        int length = 0;

        while (true) {
            if (offset + length >= source.length) {
                throw new IllegalArgumentException(
                    "VarInt decode: buffer underflow (need more bytes)"
                );
            }

            byte b = source[offset + length];
            value |= (b & 0x7F) << shift;
            length++;

            if ((b & 0x80) == 0) {
                break; // No continuation bit, we're done
            }

            shift += 7;

            if (shift >= 32) {
                throw new IllegalArgumentException(
                    "VarInt decode: value too large (overflow)"
                );
            }
        }

        byte[] bytes = Arrays.copyOfRange(source, offset, offset + length);
        return new DecodeResult(value, length, bytes);
    }

    /**
     * Decodes a varint from the beginning of a byte array.
     *
     * @param source the byte array to decode from
     * @return the decode result
     */
    public static DecodeResult decode(byte[] source) {
        return decode(source, 0);
    }

    /**
     * Returns the decoded integer value.
     *
     * @return the integer value
     */
    public int getValue() {
        return value;
    }

    /**
     * Returns the encoded byte array.
     *
     * @return a copy of the encoded bytes
     */
    public byte[] data() {
        return Arrays.copyOf(bytes, bytes.length);
    }

    /**
     * Returns the number of bytes in the encoded representation.
     *
     * @return the byte length
     */
    public int length() {
        return bytes.length;
    }

    /**
     * Converts the varint bytes to a hex string.
     *
     * @return the hex string representation
     */
    public String toHexString() {
        StringBuilder hex = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            hex.append(String.format("%02x", b & 0xFF));
        }
        return hex.toString();
    }

    /**
     * Returns a string representation showing the value in hex.
     *
     * @return string like "0x80" for value 128
     */
    @Override
    public String toString() {
        return "0x" + Integer.toHexString(value);
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) return true;
        if (!(other instanceof VarInt)) return false;
        VarInt varInt = (VarInt) other;
        return value == varInt.value && Arrays.equals(bytes, varInt.bytes);
    }

    @Override
    public int hashCode() {
        return 31 * value + Arrays.hashCode(bytes);
    }
}
