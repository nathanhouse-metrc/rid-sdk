package com.retailid.api;

import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Sends one HTTP request for {@link RetailIdClient}.
 *
 * <p>The default implementation is {@link JdkHttpTransport}. Supply your own
 * (for proxies, custom TLS, or tests) with
 * {@link RetailIdClient.Builder#transport(HttpTransport)}.
 *
 * <p>Implementations must throw {@link java.net.http.HttpTimeoutException} when
 * the request times out, so the client can apply its retry rules.
 *
 * @author Metrc LLC
 */
public interface HttpTransport extends AutoCloseable {

    /**
     * Sends a request and returns the response, whatever its status code.
     *
     * @param request the request
     * @return the response
     * @throws java.net.http.HttpTimeoutException if the request timed out
     * @throws IOException for other network failures
     * @throws InterruptedException if the calling thread was interrupted
     */
    Response send(Request request) throws IOException, InterruptedException;

    /** Releases resources. The default does nothing. */
    @Override
    default void close() {
    }

    /** An HTTP request built by the client. */
    final class Request {
        private final String method;
        private final URI uri;
        private final Map<String, String> headers;
        private final byte[] body;
        private final Duration timeout;

        /**
         * @param method the HTTP method
         * @param uri the full URI including the query string
         * @param headers the request headers
         * @param body the request body, or {@code null}
         * @param timeout the per-request timeout
         */
        public Request(String method, URI uri, Map<String, String> headers, byte[] body, Duration timeout) {
            this.method = method;
            this.uri = uri;
            this.headers = Collections.unmodifiableMap(new LinkedHashMap<>(headers));
            this.body = body == null ? null : body.clone();
            this.timeout = timeout;
        }

        /** @return the HTTP method */
        public String getMethod() {
            return method;
        }

        /** @return the full URI including the query string */
        public URI getUri() {
            return uri;
        }

        /** @return the request headers */
        public Map<String, String> getHeaders() {
            return headers;
        }

        /** @return a copy of the request body, or {@code null} if there is none */
        public byte[] getBody() {
            return body == null ? null : body.clone();
        }

        /** @return the per-request timeout */
        public Duration getTimeout() {
            return timeout;
        }
    }

    /** An HTTP response returned by a transport. */
    final class Response {
        private final int statusCode;
        private final Map<String, List<String>> headers;
        private final byte[] body;

        /**
         * @param statusCode the HTTP status code
         * @param headers the response headers (looked up case-insensitively)
         * @param body the response body, or {@code null}
         */
        public Response(int statusCode, Map<String, List<String>> headers, byte[] body) {
            this.statusCode = statusCode;
            Map<String, List<String>> copy = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
            if (headers != null) {
                copy.putAll(headers);
            }
            this.headers = Collections.unmodifiableMap(copy);
            this.body = body == null ? new byte[0] : body.clone();
        }

        /** @return the HTTP status code */
        public int getStatusCode() {
            return statusCode;
        }

        /** @return the response headers, keyed case-insensitively */
        public Map<String, List<String>> getHeaders() {
            return headers;
        }

        /**
         * @param name the header name (case-insensitive)
         * @return the first value of the header, or {@code null}
         */
        public String header(String name) {
            List<String> values = headers.get(name);
            return values == null || values.isEmpty() ? null : values.get(0);
        }

        /** @return a copy of the response body (empty if there was none) */
        public byte[] getBody() {
            return body.clone();
        }
    }
}
