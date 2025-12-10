package com.retailid;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Comprehensive test suite for the RetailID Java SDK.
 *
 * @author Metrc LLC
 */
public class RetailIdTest {

    /**
     * Test vectors from the JavaScript SDK.
     * These MUST pass to ensure feature parity.
     */
    @ParameterizedTest
    @CsvSource({
        "HTTPS://1A4.COM/5LN8CBN1UB33DON9CHKX,       1a4060300020081000006609, 1",
        "HTTPS://1A4.COM/13TX7BMRX3IU01B9EGTPTT,     1a4060300020081000006609, 128",
        "HTTPS://1A4.COM/7V8S42PYJD1XC9C2UVNCD1D,    1a4060300020081000006609, 16384",
        "https://1a4.com/GkBgMAAEG2AAAJKXEQ,          1a40603000041b6000009297, 17"
    })
    @DisplayName("Test vectors from JavaScript SDK")
    void testVectors(String url, String expectedBatchId, int expectedIndex) {
        RetailIdPair pair = RetailId.decode(url);

        assertEquals(expectedBatchId, pair.getBatchId().toHexString(),
            "Batch ID should match for URL: " + url);
        assertEquals(expectedIndex, pair.getIndex(),
            "Index should match for URL: " + url);
    }

    @Test
    @DisplayName("Encode and decode base36 (index=1)")
    void testBase36Index1() {
        ObjectId batchId = new ObjectId("1a4060300020081000006609");
        int index = 1;

        String url = RetailId.encode(batchId, index);
        assertEquals("HTTPS://1A4.COM/5LN8CBN1UB33DON9CHKX", url);

        RetailIdPair decoded = RetailId.decode(url);
        assertEquals(batchId.toHexString(), decoded.getBatchId().toHexString());
        assertEquals(index, decoded.getIndex());
    }

    @Test
    @DisplayName("Encode and decode base36 (index=128)")
    void testBase36Index128() {
        ObjectId batchId = new ObjectId("1a4060300020081000006609");
        int index = 128;

        String url = RetailId.encode(batchId, index);
        assertEquals("HTTPS://1A4.COM/13TX7BMRX3IU01B9EGTPTT", url);

        RetailIdPair decoded = RetailId.decode(url);
        assertEquals(batchId.toHexString(), decoded.getBatchId().toHexString());
        assertEquals(index, decoded.getIndex());
    }

    @Test
    @DisplayName("Encode and decode base36 (index=16384)")
    void testBase36Index16384() {
        ObjectId batchId = new ObjectId("1a4060300020081000006609");
        int index = 16384;

        String url = RetailId.encode(batchId, index);
        assertEquals("HTTPS://1A4.COM/7V8S42PYJD1XC9C2UVNCD1D", url);

        RetailIdPair decoded = RetailId.decode(url);
        assertEquals(batchId.toHexString(), decoded.getBatchId().toHexString());
        assertEquals(index, decoded.getIndex());
    }

    @Test
    @DisplayName("Encode and decode base64")
    void testBase64() {
        ObjectId batchId = new ObjectId("1a40603000041b6000009297");
        int index = 17;

        EncodeOptions options = new EncodeOptions().setBase64(true);
        String url = RetailId.encode(batchId, index, options);
        assertEquals("https://1a4.com/GkBgMAAEG2AAAJKXEQ", url);

        RetailIdPair decoded = RetailId.decode(url);
        assertEquals(batchId.toHexString(), decoded.getBatchId().toHexString());
        assertEquals(index, decoded.getIndex());
    }

    @Test
    @DisplayName("RetailIdPair constructor and encode method")
    void testRetailIdPairConstructor() {
        String url = "HTTPS://1A4.COM/5LN8CBN1UB33DON9CHKX";
        RetailIdPair pair = new RetailIdPair(url);

        assertEquals("1a4060300020081000006609", pair.getBatchId().toHexString());
        assertEquals(1, pair.getIndex());

        // Encode back
        String encoded = pair.encode();
        assertEquals(url, encoded);
    }

    @Test
    @DisplayName("RetailIdPair with base64 encoding")
    void testRetailIdPairBase64() {
        String url = "https://1a4.com/GkBgMAAEG2AAAJKXEQ";
        RetailIdPair pair = new RetailIdPair(url);

        assertEquals("1a40603000041b6000009297", pair.getBatchId().toHexString());
        assertEquals(17, pair.getIndex());

        // Encode back as base64
        EncodeOptions options = new EncodeOptions().setBase64(true);
        String encoded = pair.encode(options);
        assertEquals(url, encoded);
    }

    @Test
    @DisplayName("Custom domain")
    void testCustomDomain() {
        ObjectId batchId = new ObjectId("1a4060300020081000006609");
        int index = 1;

        EncodeOptions options = new EncodeOptions().setDomain("abc.com");
        String url = RetailId.encode(batchId, index, options);
        assertEquals("HTTPS://ABC.COM/5LN8CBN1UB33DON9CHKX", url);

        RetailIdPair decoded = RetailId.decode(url);
        assertEquals(batchId.toHexString(), decoded.getBatchId().toHexString());
        assertEquals(index, decoded.getIndex());
    }

    @Test
    @DisplayName("Decode URL without protocol")
    void testDecodeShortCode() {
        String shortCode = "5LN8CBN1UB33DON9CHKX";
        RetailIdPair pair = RetailId.decode(shortCode);

        assertEquals("1a4060300020081000006609", pair.getBatchId().toHexString());
        assertEquals(1, pair.getIndex());
    }

    @Test
    @DisplayName("Various index values")
    void testVariousIndexes() {
        ObjectId batchId = new ObjectId("1a4060300020081000006609");

        int[] indexes = {0, 1, 127, 128, 255, 256, 16383, 16384, 65535, 100000};

        for (int index : indexes) {
            String url = RetailId.encode(batchId, index);
            RetailIdPair decoded = RetailId.decode(url);
            assertEquals(index, decoded.getIndex(), "Index should match for value: " + index);
        }
    }

    @Test
    @DisplayName("Round-trip encoding preserves data")
    void testRoundTrip() {
        ObjectId batchId = new ObjectId("1a40603000041b6000009297");
        int index = 12345;

        // Base36 round trip
        String url36 = RetailId.encode(batchId, index);
        RetailIdPair decoded36 = RetailId.decode(url36);
        assertEquals(batchId.toHexString(), decoded36.getBatchId().toHexString());
        assertEquals(index, decoded36.getIndex());

        // Base64 round trip
        EncodeOptions opts = new EncodeOptions().setBase64(true);
        String url64 = RetailId.encode(batchId, index, opts);
        RetailIdPair decoded64 = RetailId.decode(url64);
        assertEquals(batchId.toHexString(), decoded64.getBatchId().toHexString());
        assertEquals(index, decoded64.getIndex());
    }

    @Test
    @DisplayName("Invalid URL throws exception")
    void testInvalidUrl() {
        assertThrows(IllegalArgumentException.class, () -> {
            RetailId.decode("https://example.com/invalid");
        });
    }

    @Test
    @DisplayName("Empty URL throws exception")
    void testEmptyUrl() {
        assertThrows(IllegalArgumentException.class, () -> {
            RetailId.decode("");
        });
    }

    @Test
    @DisplayName("Null URL throws exception")
    void testNullUrl() {
        assertThrows(IllegalArgumentException.class, () -> {
            RetailId.decode(null);
        });
    }

    @Test
    @DisplayName("Negative index throws exception")
    void testNegativeIndex() {
        ObjectId batchId = new ObjectId("1a4060300020081000006609");
        assertThrows(IllegalArgumentException.class, () -> {
            RetailId.encode(batchId, -1);
        });
    }

    @Test
    @DisplayName("Null batch ID throws exception")
    void testNullBatchId() {
        assertThrows(IllegalArgumentException.class, () -> {
            RetailId.encode(null, 1);
        });
    }

    @Test
    @DisplayName("RetailIdPair equality")
    void testRetailIdPairEquality() {
        RetailIdPair pair1 = new RetailIdPair("HTTPS://1A4.COM/5LN8CBN1UB33DON9CHKX");
        RetailIdPair pair2 = new RetailIdPair("HTTPS://1A4.COM/5LN8CBN1UB33DON9CHKX");
        RetailIdPair pair3 = new RetailIdPair("HTTPS://1A4.COM/13TX7BMRX3IU01B9EGTPTT");

        assertEquals(pair1, pair2);
        assertNotEquals(pair1, pair3);
        assertEquals(pair1.hashCode(), pair2.hashCode());
    }

    @Test
    @DisplayName("Case insensitivity for Base36")
    void testCaseInsensitivity() {
        // Base36 should be case-insensitive during decode
        String upper = "HTTPS://1A4.COM/5LN8CBN1UB33DON9CHKX";
        String lower = "https://1a4.com/5ln8cbn1ub33don9chkx";

        RetailIdPair pairUpper = RetailId.decode(upper);
        RetailIdPair pairLower = RetailId.decode(lower);

        assertEquals(pairUpper.getBatchId().toHexString(), pairLower.getBatchId().toHexString());
        assertEquals(pairUpper.getIndex(), pairLower.getIndex());
    }
}
