package com.retailid.api;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Transport that records each request and replays queued responses (or throws
 * queued exceptions), so tests see exactly what the client sent.
 */
final class FakeTransport implements HttpTransport {

    /** One recorded request, decoded for easy assertions. */
    static final class Call {
        final String method;
        final String path;
        final Map<String, String> query;
        final Map<String, String> headers;
        final Object json;
        final Duration timeout;

        Call(Request request) {
            this.method = request.getMethod();
            this.path = request.getUri().getRawPath();
            this.query = parseQuery(request.getUri().getRawQuery());
            this.headers = request.getHeaders();
            byte[] body = request.getBody();
            this.json = body == null ? null : Json.parse(new String(body, StandardCharsets.UTF_8));
            this.timeout = request.getTimeout();
        }

        private static Map<String, String> parseQuery(String raw) {
            Map<String, String> query = new LinkedHashMap<>();
            if (raw == null || raw.isEmpty()) {
                return query;
            }
            for (String pair : raw.split("&")) {
                String[] kv = pair.split("=", 2);
                query.put(URLDecoder.decode(kv[0], StandardCharsets.UTF_8),
                    kv.length > 1 ? URLDecoder.decode(kv[1], StandardCharsets.UTF_8) : "");
            }
            return query;
        }
    }

    final List<Call> calls = new ArrayList<>();
    private final Deque<Object> responses;
    boolean closed;

    FakeTransport(Object... responses) {
        this.responses = new ArrayDeque<>(Arrays.asList(responses));
    }

    @Override
    public Response send(Request request) throws IOException {
        calls.add(new Call(request));
        Object next = responses.poll();
        if (next == null) {
            throw new AssertionError("Unexpected request: " + request.getMethod() + " " + request.getUri());
        }
        if (next instanceof IOException) {
            throw (IOException) next;
        }
        if (next instanceof RuntimeException) {
            throw (RuntimeException) next;
        }
        return (Response) next;
    }

    @Override
    public void close() {
        closed = true;
    }

    static Response ok(Object payload) {
        return ok(payload, 200, Collections.emptyMap());
    }

    static Response ok(Object payload, int status) {
        return ok(payload, status, Collections.emptyMap());
    }

    static Response ok(Object payload, int status, Map<String, String> headers) {
        Map<String, List<String>> multi = new LinkedHashMap<>();
        headers.forEach((k, v) -> multi.put(k, Collections.singletonList(v)));
        byte[] body = payload == null ? new byte[0] : Json.stringify(payload).getBytes(StandardCharsets.UTF_8);
        return new Response(status, multi, body);
    }
}
