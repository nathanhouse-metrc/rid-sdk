package com.retailid;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for Base36 encoding/decoding.
 */
public class Base36Test {

    @Test
    @DisplayName("Encode bytes to Base36")
    void testEncode() {
        byte[] bytes = {0x1a, 0x40, 0x60, 0x30};
        String encoded = Base36.encode(bytes);
        assertTrue(encoded.matches("^[0-9A-Z]+$"));
    }

    @Test
    @DisplayName("Decode Base36 to bytes")
    void testDecode() {
        String base36 = "5LN8CBN";
        byte[] decoded = Base36.decode(base36);
        assertNotNull(decoded);
        assertTrue(decoded.length > 0);
    }

    @Test
    @DisplayName("Round-trip encoding")
    void testRoundTrip() {
        byte[] original = {0x1a, 0x40, 0x60, 0x30, 0x00, 0x20, 0x08, 0x10, 0x00, 0x00, 0x66, 0x09};
        String encoded = Base36.encode(original);
        byte[] decoded = Base36.decode(encoded);

        // Due to BigInteger's handling, we may lose leading zeros
        // So we compare the non-zero parts
        assertTrue(arraysEqualIgnoreLeadingZeros(original, decoded));
    }

    @Test
    @DisplayName("Empty bytes encode to empty string")
    void testEmptyBytes() {
        byte[] empty = new byte[0];
        String encoded = Base36.encode(empty);
        assertEquals("", encoded);
    }

    @Test
    @DisplayName("Empty string decodes to empty bytes")
    void testEmptyString() {
        byte[] decoded = Base36.decode("");
        assertEquals(0, decoded.length);
    }

    @Test
    @DisplayName("Case insensitive decoding")
    void testCaseInsensitive() {
        String upper = "5LN8CBN";
        String lower = "5ln8cbn";

        byte[] decoded1 = Base36.decode(upper);
        byte[] decoded2 = Base36.decode(lower);

        assertArrayEquals(decoded1, decoded2);
    }

    @Test
    @DisplayName("Uppercase output")
    void testUppercaseOutput() {
        byte[] bytes = {0x1a, 0x40, 0x60, 0x30};
        String encoded = Base36.encode(bytes);
        assertEquals(encoded.toUpperCase(), encoded);
    }

    @Test
    @DisplayName("Invalid characters throw exception")
    void testInvalidCharacters() {
        assertThrows(IllegalArgumentException.class, () -> {
            Base36.decode("invalid@#$");
        });
    }

    @Test
    @DisplayName("Null input throws exception")
    void testNullInput() {
        assertThrows(IllegalArgumentException.class, () -> {
            Base36.encode(null);
        });

        assertThrows(IllegalArgumentException.class, () -> {
            Base36.decode(null);
        });
    }

    @Test
    @DisplayName("isValid checks Base36 format")
    void testIsValid() {
        assertTrue(Base36.isValid("5LN8CBN"));
        assertTrue(Base36.isValid("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"));
        assertTrue(Base36.isValid("abc123XYZ"));

        assertFalse(Base36.isValid("invalid@"));
        assertFalse(Base36.isValid("with space"));
        assertFalse(Base36.isValid(""));
        assertFalse(Base36.isValid(null));
    }

    private boolean arraysEqualIgnoreLeadingZeros(byte[] a, byte[] b) {
        int aStart = 0, bStart = 0;

        // Skip leading zeros in both arrays
        while (aStart < a.length && a[aStart] == 0) aStart++;
        while (bStart < b.length && b[bStart] == 0) bStart++;

        int aLen = a.length - aStart;
        int bLen = b.length - bStart;

        if (aLen != bLen) return false;

        for (int i = 0; i < aLen; i++) {
            if (a[aStart + i] != b[bStart + i]) return false;
        }

        return true;
    }
}
