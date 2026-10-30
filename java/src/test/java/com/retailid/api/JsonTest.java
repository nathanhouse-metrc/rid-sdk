package com.retailid.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigInteger;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class JsonTest {

    @Test
    void parsesNestedValues() {
        Object value = Json.parse(" {\"a\": [1, -2.5, true, false, null, \"x\"], \"b\": {}, \"c\": []} ");
        Map<?, ?> map = (Map<?, ?>) value;
        assertEquals(Arrays.asList(1L, -2.5, true, false, null, "x"), map.get("a"));
        assertEquals(Collections.emptyMap(), map.get("b"));
        assertEquals(Collections.emptyList(), map.get("c"));
        assertEquals(Arrays.asList("a", "b", "c"), Arrays.asList(map.keySet().toArray()));
    }

    @Test
    void parsesNumbers() {
        assertEquals(0L, Json.parse("0"));
        assertEquals(1e3, Json.parse("1E3"));
        assertEquals(new BigInteger("123456789012345678901234567890"), Json.parse("123456789012345678901234567890"));
    }

    @Test
    void parsesEscapes() {
        assertEquals("q\"b\\s/\n\t\u00e9", Json.parse("\"q\\\"b\\\\s\\/\\n\\t\\u00e9\""));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "{", "[1,", "{\"a\" 1}", "tru", "1.", "-", "\"abc", "[1] 2", "{'a':1}", "01x"})
    void rejectsInvalidJson(String text) {
        assertThrows(IllegalArgumentException.class, () -> Json.parse(text));
    }

    @Test
    void roundTrips() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("s", "line\nbreak \"quoted\" \u0001");
        map.put("n", 3);
        map.put("d", 1.5);
        map.put("whole", 2.0);
        map.put("b", true);
        map.put("z", null);
        map.put("list", Arrays.asList(1, "two", Collections.singletonMap("k", "v")));
        map.put("array", new Object[] {"a"});
        String text = Json.stringify(map);
        assertEquals("{\"s\":\"line\\nbreak \\\"quoted\\\" \\u0001\",\"n\":3,\"d\":1.5,\"whole\":2,\"b\":true,"
            + "\"z\":null,\"list\":[1,\"two\",{\"k\":\"v\"}],\"array\":[\"a\"]}", text);
        Map<?, ?> back = (Map<?, ?>) Json.parse(text);
        assertEquals(map.get("s"), back.get("s"));
        assertEquals(3L, back.get("n"));
    }

    @Test
    void stringifiesAssociations() {
        Association a = new Association("PKG", Collections.singletonList("https://1a4.com/X"));
        assertEquals("[{\"PackageLabel\":\"PKG\",\"QrUrls\":[\"https://1a4.com/X\"]}]",
            Json.stringify(Collections.singletonList(a)));
    }

    @Test
    void rejectsUnsupportedValues() {
        assertThrows(IllegalArgumentException.class, () -> Json.stringify(new Object()));
        assertThrows(IllegalArgumentException.class, () -> Json.stringify(Double.NaN));
    }

    @Test
    void helpers() {
        assertEquals(5, Json.asInteger(5L));
        assertEquals(5, Json.asInteger("5"));
        assertNull(Json.asInteger("x"));
        assertNull(Json.asInteger(null));
        assertFalse(Json.truthy(null));
        assertFalse(Json.truthy(0L));
        assertFalse(Json.truthy(""));
        assertFalse(Json.truthy(Collections.emptyList()));
        assertTrue(Json.truthy("x"));
        assertTrue(Json.truthy(1L));
        List<Object> list = Json.asList("not a list");
        assertTrue(list.isEmpty());
    }
}
