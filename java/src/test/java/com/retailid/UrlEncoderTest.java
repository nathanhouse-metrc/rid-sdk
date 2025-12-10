package com.retailid;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for UrlEncoder class.
 */
public class UrlEncoderTest {

    @Test
    @DisplayName("Encode URL-safe Base64")
    void testEncodeUrl64() {
        String standard = "abc+def/ghi==";
        String urlSafe = UrlEncoder.encodeUrl64(standard);
        assertEquals("abc-def_ghi", urlSafe);
    }

    @Test
    @DisplayName("Decode URL-safe Base64")
    void testDecodeUrl64() {
        String urlSafe = "abc-def_ghi";
        String standard = UrlEncoder.decodeUrl64(urlSafe);
        assertEquals("abc+def/ghi=", standard);
    }

    @Test
    @DisplayName("Round-trip URL encoding")
    void testRoundTrip() {
        String original = "test+data/here==";
        String encoded = UrlEncoder.encodeUrl64(original);
        String decoded = UrlEncoder.decodeUrl64(encoded);
        assertEquals(original, decoded);
    }

    @Test
    @DisplayName("Bytes to URL Base64")
    void testBytesToUrlBase64() {
        byte[] bytes = {(byte)0x1a, (byte)0x40, (byte)0x60, (byte)0x30, (byte)0x00, (byte)0x04, (byte)0x1b, (byte)0x60, (byte)0x00, (byte)0x00, (byte)0x92, (byte)0x97, (byte)0x11};
        String urlBase64 = UrlEncoder.bytesToUrlBase64(bytes);

        assertNotNull(urlBase64);
        assertFalse(urlBase64.contains("+"));
        assertFalse(urlBase64.contains("/"));
        assertFalse(urlBase64.contains("="));
    }

    @Test
    @DisplayName("URL Base64 to bytes")
    void testUrlBase64ToBytes() {
        String urlBase64 = "GkBgMAAEG2AAAJKXEQ";
        byte[] bytes = UrlEncoder.urlBase64ToBytes(urlBase64);

        assertNotNull(bytes);
        assertTrue(bytes.length > 0);
    }

    @Test
    @DisplayName("Bytes round-trip through URL Base64")
    void testBytesRoundTrip() {
        byte[] original = {(byte)0x1a, (byte)0x40, (byte)0x60, (byte)0x30, (byte)0x00, (byte)0x04, (byte)0x1b, (byte)0x60, (byte)0x00, (byte)0x00, (byte)0x92, (byte)0x97, (byte)0x11};
        String encoded = UrlEncoder.bytesToUrlBase64(original);
        byte[] decoded = UrlEncoder.urlBase64ToBytes(encoded);

        assertArrayEquals(original, decoded);
    }

    @Test
    @DisplayName("Null handling")
    void testNullHandling() {
        assertNull(UrlEncoder.encodeUrl64(null));
        assertNull(UrlEncoder.decodeUrl64(null));

        assertThrows(IllegalArgumentException.class, () -> {
            UrlEncoder.bytesToUrlBase64(null);
        });

        assertThrows(IllegalArgumentException.class, () -> {
            UrlEncoder.urlBase64ToBytes(null);
        });
    }

    @Test
    @DisplayName("Padding calculation")
    void testPaddingCalculation() {
        // Length 1 (mod 4) needs 3 padding chars
        assertEquals("a===", UrlEncoder.decodeUrl64("a"));

        // Length 2 (mod 4) needs 2 padding chars
        assertEquals("ab==", UrlEncoder.decodeUrl64("ab"));

        // Length 3 (mod 4) needs 1 padding char
        assertEquals("abc=", UrlEncoder.decodeUrl64("abc"));

        // Length 0 (mod 4) needs 0 padding chars
        assertEquals("abcd", UrlEncoder.decodeUrl64("abcd"));
    }
}
