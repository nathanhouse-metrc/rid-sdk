package com.retailid;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for ObjectId class.
 */
public class ObjectIdTest {

    @Test
    @DisplayName("Create ObjectId from hex string")
    void testFromHexString() {
        String hex = "1a4060300020081000006609";
        ObjectId id = new ObjectId(hex);
        assertEquals(hex, id.toHexString());
    }

    @Test
    @DisplayName("Create ObjectId from bytes")
    void testFromBytes() {
        byte[] bytes = {0x1a, 0x40, 0x60, 0x30, 0x00, 0x20, 0x08, 0x10, 0x00, 0x00, 0x66, 0x09};
        ObjectId id = new ObjectId(bytes);
        assertEquals("1a4060300020081000006609", id.toHexString());
    }

    @Test
    @DisplayName("Generate random ObjectId")
    void testRandomGeneration() {
        ObjectId id1 = new ObjectId();
        ObjectId id2 = new ObjectId();

        assertNotNull(id1.toHexString());
        assertNotNull(id2.toHexString());
        assertEquals(24, id1.toHexString().length());
        assertEquals(24, id2.toHexString().length());

        // Very unlikely to be equal
        assertNotEquals(id1.toHexString(), id2.toHexString());
    }

    @Test
    @DisplayName("getId returns copy")
    void testGetIdReturnsCopy() {
        ObjectId id = new ObjectId("1a4060300020081000006609");
        byte[] bytes1 = id.getId();
        byte[] bytes2 = id.getId();

        assertNotSame(bytes1, bytes2, "getId should return a copy, not the same reference");
        assertArrayEquals(bytes1, bytes2);
    }

    @Test
    @DisplayName("ObjectId equality")
    void testEquality() {
        ObjectId id1 = new ObjectId("1a4060300020081000006609");
        ObjectId id2 = new ObjectId("1a4060300020081000006609");
        ObjectId id3 = new ObjectId("1a40603000041b6000009297");

        assertEquals(id1, id2);
        assertNotEquals(id1, id3);
        assertEquals(id1.hashCode(), id2.hashCode());
    }

    @Test
    @DisplayName("ObjectId equals with byte array")
    void testEqualsWithByteArray() {
        byte[] bytes = {0x1a, 0x40, 0x60, 0x30, 0x00, 0x20, 0x08, 0x10, 0x00, 0x00, 0x66, 0x09};
        ObjectId id = new ObjectId(bytes);

        assertTrue(id.equals(bytes));
    }

    @Test
    @DisplayName("Invalid hex string throws exception")
    void testInvalidHexString() {
        assertThrows(IllegalArgumentException.class, () -> {
            new ObjectId("invalid");
        });

        assertThrows(IllegalArgumentException.class, () -> {
            new ObjectId("1a4060300020081000006609ZZ");
        });

        assertThrows(IllegalArgumentException.class, () -> {
            new ObjectId("1a40603000200810000066");  // Too short
        });
    }

    @Test
    @DisplayName("Invalid bytes length throws exception")
    void testInvalidBytesLength() {
        assertThrows(IllegalArgumentException.class, () -> {
            new ObjectId(new byte[11]);
        });

        assertThrows(IllegalArgumentException.class, () -> {
            new ObjectId(new byte[13]);
        });
    }

    @Test
    @DisplayName("Null input throws exception")
    void testNullInput() {
        assertThrows(IllegalArgumentException.class, () -> {
            new ObjectId((String) null);
        });

        assertThrows(IllegalArgumentException.class, () -> {
            new ObjectId((byte[]) null);
        });
    }

    @Test
    @DisplayName("toString returns hex string")
    void testToString() {
        String hex = "1a4060300020081000006609";
        ObjectId id = new ObjectId(hex);
        assertEquals(hex, id.toString());
    }

    @Test
    @DisplayName("Case insensitive hex parsing")
    void testCaseInsensitiveHex() {
        ObjectId id1 = new ObjectId("1a4060300020081000006609");
        ObjectId id2 = new ObjectId("1A4060300020081000006609");

        assertEquals(id1, id2);
    }
}
