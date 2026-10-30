package com.retailid.api;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;
import java.util.Objects;

/**
 * {@link HttpTransport} built on the JDK's {@link HttpClient}.
 *
 * <p>The {@code HttpClient} keeps connections open for reuse, so share one
 * {@link RetailIdClient} rather than creating one per request.
 *
 * @author Metrc LLC
 */
public final class JdkHttpTransport implements HttpTransport {
    private final HttpClient httpClient;

    /** Creates a transport with a new {@code HttpClient}. */
    public JdkHttpTransport() {
        this(HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NORMAL).build());
    }

    /**
     * Creates a transport around an existing {@code HttpClient} (e.g. one with a
     * proxy, custom SSL context, or executor).
     *
     * @param httpClient the client to send requests with
     */
    public JdkHttpTransport(HttpClient httpClient) {
        this.httpClient = Objects.requireNonNull(httpClient, "httpClient");
    }

    /** @return the underlying {@code HttpClient} */
    public HttpClient getHttpClient() {
        return httpClient;
    }

    @Override
    public Response send(Request request) throws IOException, InterruptedException {
        byte[] body = request.getBody();
        HttpRequest.Builder builder = HttpRequest.newBuilder(request.getUri())
            .timeout(request.getTimeout())
            .method(request.getMethod(), body == null
                ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofByteArray(body));
        for (Map.Entry<String, String> header : request.getHeaders().entrySet()) {
            builder.header(header.getKey(), header.getValue());
        }
        HttpResponse<byte[]> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray());
        return new Response(response.statusCode(), response.headers().map(), response.body());
    }
}
