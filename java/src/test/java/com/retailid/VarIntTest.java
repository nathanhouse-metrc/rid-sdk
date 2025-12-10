package com.retailid;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for VarInt class.
 */
public class VarIntTest {

    @ParameterizedTest
    @CsvSource({
        "0, 1",
        "1, 1",
        "127, 1",
        "128, 2",
        "255, 2",
        "16383, 2",
        "16384, 3",
        "65535, 3",
        "2097151, 3",
        "2097152, 4"
    })
    @DisplayName("Varint encoding length")
    void testEncodingLength(int value, int expectedLength) {
        byte[] encoded = VarInt.encode(value);
        assertEquals(expectedLength, encoded.length);
    }

    @ParameterizedTest
    @CsvSource({
        "0, 00",
        "1, 01",
        "127, 7f",
        "128, 8001",
        "255, ff01",
        "16384, 808001",
        "300, ac02"
    })
    @DisplayName("Varint encoding values")
    void testEncodingValues(int value, String expectedHex) {
        byte[] encoded = VarInt.encode(value);
        String hex = bytesToHex(encoded);
        assertEquals(expectedHex, hex);
    }

    @Test
    @DisplayName("Decode varint")
    void testDecode() {
        byte[] encoded = {(byte) 0x80, 0x01};  // 128
        VarInt.DecodeResult result = VarInt.decode(encoded);

        assertEquals(128, result.value);
        assertEquals(2, result.length);
        assertArrayEquals(encoded, result.bytes);
    }

    @Test
    @DisplayName("Decode varint with offset")
    void testDecodeWithOffset() {
        byte[] buffer = {0x00, 0x00, (byte) 0x80, 0x01, 0x00};  // 128 at offset 2
        VarInt.DecodeResult result = VarInt.decode(buffer, 2);

        assertEquals(128, result.value);
        assertEquals(2, result.length);
    }

    @Test
    @DisplayName("VarInt constructor from value")
    void testConstructorFromValue() {
        VarInt v = new VarInt(128);
        assertEquals(128, v.getValue());
        assertEquals(2, v.length());
        assertEquals("8001", v.toHexString());
    }

    @Test
    @DisplayName("VarInt constructor from bytes")
    void testConstructorFromBytes() {
        byte[] encoded = {(byte) 0x80, 0x01};
        VarInt v = new VarInt(encoded);
        assertEquals(128, v.getValue());
        assertEquals(2, v.length());
    }

    @Test
    @DisplayName("Round-trip encoding")
    void testRoundTrip() {
        int[] values = {0, 1, 127, 128, 255, 256, 16383, 16384, 65535, 100000};

        for (int value : values) {
            byte[] encoded = VarInt.encode(value);
            VarInt.DecodeResult decoded = VarInt.decode(encoded);
            assertEquals(value, decoded.value, "Value should match after round-trip: " + value);
        }
    }

    @Test
    @DisplayName("Negative value throws exception")
    void testNegativeValue() {
        assertThrows(IllegalArgumentException.class, () -> {
            VarInt.encode(-1);
        });

        assertThrows(IllegalArgumentException.class, () -> {
            new VarInt(-1);
        });
    }

    @Test
    @DisplayName("Buffer underflow throws exception")
    void testBufferUnderflow() {
        byte[] incomplete = {(byte) 0x80};  // Continuation bit set but no next byte
        assertThrows(IllegalArgumentException.class, () -> {
            VarInt.decode(incomplete);
        });
    }

    @Test
    @DisplayName("Null or empty source throws exception")
    void testNullOrEmptySource() {
        assertThrows(IllegalArgumentException.class, () -> {
            VarInt.decode(null);
        });

        assertThrows(IllegalArgumentException.class, () -> {
            new VarInt(new byte[0]);
        });
    }

    @Test
    @DisplayName("toString shows hex value")
    void testToString() {
        VarInt v = new VarInt(128);
        assertEquals("0x80", v.toString());
    }

    @Test
    @DisplayName("VarInt equality")
    void testEquality() {
        VarInt v1 = new VarInt(128);
        VarInt v2 = new VarInt(128);
        VarInt v3 = new VarInt(256);

        assertEquals(v1, v2);
        assertNotEquals(v1, v3);
        assertEquals(v1.hashCode(), v2.hashCode());
    }

    @Test
    @DisplayName("data() returns copy")
    void testDataReturnsCopy() {
        VarInt v = new VarInt(128);
        byte[] data1 = v.data();
        byte[] data2 = v.data();

        assertNotSame(data1, data2, "data() should return a copy");
        assertArrayEquals(data1, data2);
    }

    private String bytesToHex(byte[] bytes) {
        StringBuilder hex = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            hex.append(String.format("%02x", b & 0xFF));
        }
        return hex.toString();
    }
}
