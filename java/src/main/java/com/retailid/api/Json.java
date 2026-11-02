package com.retailid.api;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Minimal JSON reader and writer used by the Retail ID API client.
 *
 * <p>JSON values map to plain Java types so the SDK needs no external
 * dependencies:
 * <ul>
 *   <li>object: {@code Map<String, Object>} (insertion ordered)</li>
 *   <li>array: {@code List<Object>}</li>
 *   <li>string: {@code String}</li>
 *   <li>number: {@code Long} for integers that fit, otherwise {@code BigInteger}
 *       or {@code Double}</li>
 *   <li>true/false: {@code Boolean}</li>
 *   <li>null: {@code null}</li>
 * </ul>
 *
 * <p>{@link #stringify(Object)} also accepts any {@code Collection}, arrays of
 * objects, {@code Number}, {@code Boolean}, {@code CharSequence} and
 * {@link Association}.
 *
 * @author Metrc LLC
 */
public final class Json {

    private Json() {
    }

    // -- reading ---------------------------------------------------------------

    /**
     * Parses a JSON document.
     *
     * @param text the JSON text
     * @return the decoded value
     * @throws IllegalArgumentException if the text is not valid JSON
     */
    public static Object parse(String text) {
        if (text == null) {
            throw new IllegalArgumentException("JSON text cannot be null");
        }
        Parser parser = new Parser(text);
        parser.skipWhitespace();
        Object value = parser.readValue();
        parser.skipWhitespace();
        if (parser.pos != text.length()) {
            throw parser.error("Unexpected trailing characters");
        }
        return value;
    }

    private static final class Parser {
        private final String text;
        private int pos;

        Parser(String text) {
            this.text = text;
        }

        IllegalArgumentException error(String message) {
            return new IllegalArgumentException(message + " at position " + pos);
        }

        void skipWhitespace() {
            while (pos < text.length()) {
                char c = text.charAt(pos);
                if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
                    pos++;
                } else {
                    break;
                }
            }
        }

        Object readValue() {
            if (pos >= text.length()) {
                throw error("Unexpected end of JSON");
            }
            char c = text.charAt(pos);
            switch (c) {
                case '{':
                    return readObject();
                case '[':
                    return readArray();
                case '"':
                    return readString();
                case 't':
                    expectLiteral("true");
                    return Boolean.TRUE;
                case 'f':
                    expectLiteral("false");
                    return Boolean.FALSE;
                case 'n':
                    expectLiteral("null");
                    return null;
                default:
                    if (c == '-' || (c >= '0' && c <= '9')) {
                        return readNumber();
                    }
                    throw error("Unexpected character '" + c + "'");
            }
        }

        void expectLiteral(String literal) {
            if (!text.startsWith(literal, pos)) {
                throw error("Expected " + literal);
            }
            pos += literal.length();
        }

        Map<String, Object> readObject() {
            Map<String, Object> map = new LinkedHashMap<>();
            pos++; // {
            skipWhitespace();
            if (peek() == '}') {
                pos++;
                return map;
            }
            while (true) {
                skipWhitespace();
                if (peek() != '"') {
                    throw error("Expected object key");
                }
                String key = readString();
                skipWhitespace();
                if (peek() != ':') {
                    throw error("Expected ':'");
                }
                pos++;
                skipWhitespace();
                map.put(key, readValue());
                skipWhitespace();
                char c = peek();
                pos++;
                if (c == '}') {
                    return map;
                }
                if (c != ',') {
                    pos--;
                    throw error("Expected ',' or '}'");
                }
            }
        }

        List<Object> readArray() {
            List<Object> list = new ArrayList<>();
            pos++; // [
            skipWhitespace();
            if (peek() == ']') {
                pos++;
                return list;
            }
            while (true) {
                skipWhitespace();
                list.add(readValue());
                skipWhitespace();
                char c = peek();
                pos++;
                if (c == ']') {
                    return list;
                }
                if (c != ',') {
                    pos--;
                    throw error("Expected ',' or ']'");
                }
            }
        }

        char peek() {
            if (pos >= text.length()) {
                throw error("Unexpected end of JSON");
            }
            return text.charAt(pos);
        }

        String readString() {
            pos++; // opening quote
            StringBuilder sb = new StringBuilder();
            while (true) {
                if (pos >= text.length()) {
                    throw error("Unterminated string");
                }
                char c = text.charAt(pos++);
                if (c == '"') {
                    return sb.toString();
                }
                if (c == '\\') {
                    if (pos >= text.length()) {
                        throw error("Unterminated escape");
                    }
                    char e = text.charAt(pos++);
                    switch (e) {
                        case '"': sb.append('"'); break;
                        case '\\': sb.append('\\'); break;
                        case '/': sb.append('/'); break;
                        case 'b': sb.append('\b'); break;
                        case 'f': sb.append('\f'); break;
                        case 'n': sb.append('\n'); break;
                        case 'r': sb.append('\r'); break;
                        case 't': sb.append('\t'); break;
                        case 'u':
                            if (pos + 4 > text.length()) {
                                throw error("Invalid unicode escape");
                            }
                            try {
                                sb.append((char) Integer.parseInt(text.substring(pos, pos + 4), 16));
                            } catch (NumberFormatException ex) {
                                throw error("Invalid unicode escape");
                            }
                            pos += 4;
                            break;
                        default:
                            throw error("Invalid escape '\\" + e + "'");
                    }
                } else if (c < 0x20) {
                    throw error("Control character in string");
                } else {
                    sb.append(c);
                }
            }
        }

        Number readNumber() {
            int start = pos;
            if (text.charAt(pos) == '-') {
                pos++;
            }
            int digitsStart = pos;
            while (pos < text.length() && Character.isDigit(text.charAt(pos))) {
                pos++;
            }
            if (pos == digitsStart) {
                throw error("Invalid number");
            }
            boolean integral = true;
            if (pos < text.length() && text.charAt(pos) == '.') {
                integral = false;
                pos++;
                int fractionStart = pos;
                while (pos < text.length() && Character.isDigit(text.charAt(pos))) {
                    pos++;
                }
                if (pos == fractionStart) {
                    throw error("Invalid number");
                }
            }
            if (pos < text.length() && (text.charAt(pos) == 'e' || text.charAt(pos) == 'E')) {
                integral = false;
                pos++;
                if (pos < text.length() && (text.charAt(pos) == '+' || text.charAt(pos) == '-')) {
                    pos++;
                }
                int expStart = pos;
                while (pos < text.length() && Character.isDigit(text.charAt(pos))) {
                    pos++;
                }
                if (pos == expStart) {
                    throw error("Invalid number");
                }
            }
            String literal = text.substring(start, pos);
            if (!integral) {
                return Double.parseDouble(literal);
            }
            BigInteger big = new BigInteger(literal);
            return big.bitLength() < 64 ? (Number) big.longValue() : big;
        }
    }

    // -- writing ---------------------------------------------------------------

    /**
     * Serializes a value to compact JSON.
     *
     * @param value a JSON-compatible value (see the class description)
     * @return the JSON text
     * @throws IllegalArgumentException if the value cannot be represented as JSON
     */
    public static String stringify(Object value) {
        StringBuilder sb = new StringBuilder();
        write(sb, value);
        return sb.toString();
    }

    private static void write(StringBuilder sb, Object value) {
        if (value == null) {
            sb.append("null");
        } else if (value instanceof CharSequence) {
            writeString(sb, value.toString());
        } else if (value instanceof Boolean) {
            sb.append(value);
        } else if (value instanceof Double || value instanceof Float) {
            double d = ((Number) value).doubleValue();
            if (Double.isNaN(d) || Double.isInfinite(d)) {
                throw new IllegalArgumentException("JSON cannot represent " + d);
            }
            if (d == Math.rint(d) && Math.abs(d) < 1e15) {
                sb.append((long) d);
            } else {
                sb.append(d);
            }
        } else if (value instanceof BigDecimal) {
            sb.append(((BigDecimal) value).toPlainString());
        } else if (value instanceof Number) {
            sb.append(value);
        } else if (value instanceof Association) {
            write(sb, ((Association) value).toJson());
        } else if (value instanceof Map) {
            sb.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> entry : ((Map<?, ?>) value).entrySet()) {
                if (!first) {
                    sb.append(',');
                }
                first = false;
                writeString(sb, String.valueOf(entry.getKey()));
                sb.append(':');
                write(sb, entry.getValue());
            }
            sb.append('}');
        } else if (value instanceof Collection) {
            writeArray(sb, (Collection<?>) value);
        } else if (value instanceof Object[]) {
            writeArray(sb, java.util.Arrays.asList((Object[]) value));
        } else {
            throw new IllegalArgumentException(
                "Cannot serialize " + value.getClass().getName() + " to JSON");
        }
    }

    private static void writeArray(StringBuilder sb, Collection<?> items) {
        sb.append('[');
        boolean first = true;
        for (Object item : items) {
            if (!first) {
                sb.append(',');
            }
            first = false;
            write(sb, item);
        }
        sb.append(']');
    }

    private static void writeString(StringBuilder sb, String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        sb.append('"');
    }

    // -- value helpers used by the response models --------------------------------

    /** Returns the value as a map if it is a JSON object, otherwise {@code null}. */
    @SuppressWarnings("unchecked")
    static Map<String, Object> asObject(Object value) {
        return value instanceof Map ? (Map<String, Object>) value : null;
    }

    /** Returns the value as a list if it is a JSON array, otherwise an empty list. */
    @SuppressWarnings("unchecked")
    static List<Object> asList(Object value) {
        return value instanceof List ? (List<Object>) value : Collections.emptyList();
    }

    /** Converts a JSON number (or numeric string) to an Integer, or {@code null}. */
    static Integer asInteger(Object value) {
        if (value instanceof Number) {
            return ((Number) value).intValue();
        }
        if (value instanceof String) {
            try {
                return (int) Double.parseDouble(((String) value).trim());
            } catch (NumberFormatException e) {
                return null;
            }
        }
        if (value instanceof Boolean) {
            return ((Boolean) value) ? 1 : 0;
        }
        return null;
    }

    /** Returns a string value, or {@code null} if the value is absent. */
    static String asString(Object value) {
        return value == null ? null : value.toString();
    }

    /** JSON truthiness: null, false, 0, "" and empty arrays/objects are false. */
    static boolean truthy(Object value) {
        if (value == null) {
            return false;
        }
        if (value instanceof Boolean) {
            return (Boolean) value;
        }
        if (value instanceof Number) {
            return ((Number) value).doubleValue() != 0;
        }
        if (value instanceof CharSequence) {
            return ((CharSequence) value).length() > 0;
        }
        if (value instanceof Collection) {
            return !((Collection<?>) value).isEmpty();
        }
        if (value instanceof Map) {
            return !((Map<?, ?>) value).isEmpty();
        }
        return true;
    }

    /** Python-style {@code a or b}: the first value if truthy, otherwise the second. */
    static Object or(Object first, Object second) {
        return truthy(first) ? first : second;
    }

    /** Wraps a map so callers can't modify a model's raw response. */
    static Map<String, Object> readOnly(Map<String, Object> map) {
        return map == null ? Collections.emptyMap() : Collections.unmodifiableMap(map);
    }
}
