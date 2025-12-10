package com.retailid;

import java.util.Base64;

/**
 * URL-safe encoding utilities for Base64.
 *
 * <p>Converts standard Base64 encoding to URL-safe format by:
 * <ul>
 *   <li>Replacing '+' with '-'</li>
 *   <li>Replacing '/' with '_'</li>
 *   <li>Removing trailing '=' padding</li>
 * </ul>
 *
 * <p>Example usage:
 * <pre>
 * String standard = "abc+def/ghi==";
 * String urlSafe = UrlEncoder.encodeUrl64(standard);  // "abc-def_ghi"
 * String decoded = UrlEncoder.decodeUrl64(urlSafe);   // "abc+def/ghi=="
 * </pre>
 *
 * @author Metrc LLC
 */
public class UrlEncoder {

    /**
     * Converts a standard Base64 string to URL-safe format.
     *
     * @param base64 the standard Base64 string
     * @return the URL-safe encoded string
     */
    public static String encodeUrl64(String base64) {
        if (base64 == null) {
            return null;
        }
        return base64.replace("=", "")
                     .replace("+", "-")
                     .replace("/", "_");
    }

    /**
     * Converts a URL-safe Base64 string back to standard Base64 format.
     *
     * @param encoded the URL-safe encoded string
     * @return the standard Base64 string with padding
     */
    public static String decodeUrl64(String encoded) {
        if (encoded == null) {
            return null;
        }

        // Replace URL-safe characters with standard Base64 characters
        String base64 = encoded.replace("-", "+").replace("_", "/");

        // Add back padding
        int padding = (4 - (base64.length() % 4)) % 4;
        for (int i = 0; i < padding; i++) {
            base64 += "=";
        }

        return base64;
    }

    /**
     * Encodes bytes to URL-safe Base64 string.
     *
     * @param bytes the bytes to encode
     * @return the URL-safe Base64 string
     */
    public static String bytesToUrlBase64(byte[] bytes) {
        if (bytes == null) {
            throw new IllegalArgumentException("Bytes cannot be null");
        }
        String base64 = Base64.getEncoder().encodeToString(bytes);
        return encodeUrl64(base64);
    }

    /**
     * Decodes a URL-safe Base64 string to bytes.
     *
     * @param urlBase64 the URL-safe Base64 string
     * @return the decoded bytes
     */
    public static byte[] urlBase64ToBytes(String urlBase64) {
        if (urlBase64 == null) {
            throw new IllegalArgumentException("URL Base64 string cannot be null");
        }
        String standard = decodeUrl64(urlBase64);
        return Base64.getDecoder().decode(standard);
    }
}
