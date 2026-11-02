package com.retailid.api;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.Deque;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Optional;
import java.util.TreeSet;
import java.util.concurrent.ThreadLocalRandom;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Client for the Metrc Retail ID API.
 *
 * <p>Wraps the endpoints described in the Retail ID API Integration Guide:
 * <ul>
 *   <li>Label printing: allotment, generate, packages/info, receive</li>
 *   <li>Receiving: receive (by package label or QR short code), associate, merge</li>
 *   <li>Point of sale: sales receipts and delivery endpoints carrying {@code QrCodes}</li>
 *   <li>Catalog: global products</li>
 * </ul>
 *
 * <p>Every request is authenticated with HTTP Basic auth using the vendor API
 * key as the username and the user API key as the password. Keys are never
 * logged.
 *
 * <p>Example:
 * <pre>
 * try (RetailIdClient client = RetailIdClient.fromConfig()) {
 *     // or: RetailIdClient.builder(vendorKey, userKey).stateCode("md").build()
 *     GenerateResult result = client.generate("837-XYZ", "1A4060300007777000000001", 3);
 *     ReceiveResult received = client.receive("837-XYZ", "1A4060300007777000000001");
 *     for (String url : received.getEaches()) {
 *         printLabel(url);
 *     }
 * }
 * </pre>
 *
 * <p>Retries: 429 responses are always retried (honoring {@code Retry-After});
 * timeouts and 5xx responses are retried only for GET/read calls. Calls that
 * change data are never retried after a timeout or server error, because they
 * may already have been applied (section 10 of the guide).
 *
 * <p>JSON values are plain Java types: objects are {@code Map<String, Object>},
 * arrays are {@code List<Object>} (see {@link Json}).
 *
 * <p>Instances are thread-safe. Close the client to release a transport it created.
 *
 * @author Metrc LLC
 */
public final class RetailIdClient implements AutoCloseable {

    /** Section 10: "When a request takes a list of records, send no more than 10 per request." */
    public static final int MAX_RECORDS_PER_REQUEST = 10;

    /** Section 8: sales endpoints that accept Retail IDs in {@code Transactions[].QrCodes}. */
    public static final Map<String, String> SALES_ENDPOINTS;

    static {
        Map<String, String> endpoints = new LinkedHashMap<>();
        endpoints.put("receipts", "/sales/v2/receipts");
        endpoints.put("deliveries", "/sales/v2/deliveries");
        endpoints.put("deliveries_retailer", "/sales/v2/deliveries/retailer");
        endpoints.put("deliveries_retailer_sale", "/sales/v2/deliveries/retailer/sale");
        SALES_ENDPOINTS = Collections.unmodifiableMap(endpoints);
    }

    private static final Logger LOG = Logger.getLogger("com.retailid.api");

    /** Pauses between retries; replaceable for testing. */
    @FunctionalInterface
    public interface Sleeper {
        /**
         * Waits for the given delay.
         *
         * @param delay how long to wait
         * @throws InterruptedException if interrupted while waiting
         */
        void sleep(Duration delay) throws InterruptedException;
    }

    private final String baseUrl;
    private final Duration timeout;
    private final int maxRetries;
    private final Duration backoffBase;
    private final HttpTransport transport;
    private final boolean ownsTransport;
    private final Sleeper sleeper;
    private final String authorization;

    private RetailIdClient(Builder b) {
        if (isNullOrEmpty(b.vendorApiKey) || isNullOrEmpty(b.userApiKey)) {
            throw new IllegalArgumentException("Both vendorApiKey and userApiKey are required");
        }
        String url = b.baseUrl;
        if (url == null) {
            if (isNullOrEmpty(b.stateCode) || b.stateCode.trim().isEmpty()) {
                throw new IllegalArgumentException("Provide either stateCode or baseUrl");
            }
            url = "https://api-" + b.stateCode.trim().toLowerCase(Locale.ROOT) + ".metrc.com";
        }
        while (url.endsWith("/")) {
            url = url.substring(0, url.length() - 1);
        }
        if (b.maxRetries < 0) {
            throw new IllegalArgumentException("maxRetries cannot be negative");
        }
        this.baseUrl = url;
        this.timeout = Objects.requireNonNull(b.timeout, "timeout");
        this.maxRetries = b.maxRetries;
        this.backoffBase = Objects.requireNonNull(b.backoffBase, "backoffBase");
        this.ownsTransport = b.transport == null;
        this.transport = b.transport != null ? b.transport : new JdkHttpTransport();
        this.sleeper = Objects.requireNonNull(b.sleeper, "sleeper");
        String credentials = b.vendorApiKey + ":" + b.userApiKey;
        this.authorization = "Basic " + Base64.getEncoder().encodeToString(credentials.getBytes(StandardCharsets.UTF_8));
    }

    private static boolean isNullOrEmpty(String s) {
        return s == null || s.isEmpty();
    }

    // -- construction ------------------------------------------------------------

    /**
     * Starts building a client from API keys.
     *
     * @param vendorApiKey the vendor (software) API key
     * @param userApiKey the API key of the Metrc user making requests
     * @return a builder; set {@link Builder#stateCode} or {@link Builder#baseUrl} before building
     */
    public static Builder builder(String vendorApiKey, String userApiKey) {
        return new Builder(vendorApiKey, userApiKey);
    }

    /**
     * Starts building a client from a config. Builder settings made afterwards
     * override values from the config.
     *
     * @param config the config
     * @return a builder pre-filled from the config
     */
    public static Builder builder(RetailIdConfig config) {
        return new Builder(config.getVendorApiKey(), config.getUserApiKey())
            .stateCode(config.getStateCode())
            .baseUrl(config.getBaseUrl())
            .timeout(config.getTimeout())
            .maxRetries(config.getMaxRetries())
            .backoffBase(config.getBackoffBase());
    }

    /**
     * Builds a client from {@code $RETAILID_CONFIG} or {@code ./config.json}.
     *
     * @return the client
     * @throws RetailIdConfigException if the file is missing or incomplete
     */
    public static RetailIdClient fromConfig() {
        return builder(RetailIdConfig.load()).build();
    }

    /**
     * Builds a client from a {@code config.json} file.
     *
     * @param path the config file
     * @return the client
     * @throws RetailIdConfigException if the file is missing or incomplete
     */
    public static RetailIdClient fromConfig(Path path) {
        return builder(RetailIdConfig.load(path)).build();
    }

    /**
     * Builds a client from a config.
     *
     * @param config the config
     * @return the client
     */
    public static RetailIdClient fromConfig(RetailIdConfig config) {
        return builder(config).build();
    }

    /** Builder for {@link RetailIdClient}. */
    public static final class Builder {
        private final String vendorApiKey;
        private final String userApiKey;
        private String stateCode;
        private String baseUrl;
        private Duration timeout = RetailIdConfig.DEFAULT_TIMEOUT;
        private int maxRetries = RetailIdConfig.DEFAULT_MAX_RETRIES;
        private Duration backoffBase = RetailIdConfig.DEFAULT_BACKOFF_BASE;
        private HttpTransport transport;
        private Sleeper sleeper = delay -> Thread.sleep(delay.toMillis());

        private Builder(String vendorApiKey, String userApiKey) {
            this.vendorApiKey = vendorApiKey;
            this.userApiKey = userApiKey;
        }

        /**
         * @param stateCode the market code, e.g. {@code "md"} for {@code https://api-md.metrc.com}
         * @return this builder
         */
        public Builder stateCode(String stateCode) {
            this.stateCode = stateCode;
            return this;
        }

        /**
         * @param baseUrl the full base URL; overrides the state code (use for the Sandbox)
         * @return this builder
         */
        public Builder baseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
            return this;
        }

        /**
         * @param timeout the per-request timeout (default 30 seconds)
         * @return this builder
         */
        public Builder timeout(Duration timeout) {
            this.timeout = timeout;
            return this;
        }

        /**
         * @param maxRetries the maximum retries for retryable responses (default 3)
         * @return this builder
         */
        public Builder maxRetries(int maxRetries) {
            this.maxRetries = maxRetries;
            return this;
        }

        /**
         * @param backoffBase the base delay when no {@code Retry-After} is sent (default 1 second)
         * @return this builder
         */
        public Builder backoffBase(Duration backoffBase) {
            this.backoffBase = backoffBase;
            return this;
        }

        /**
         * Uses a custom transport (e.g. a {@link JdkHttpTransport} around an
         * {@code HttpClient} with a proxy). It is not closed by {@link RetailIdClient#close()}.
         *
         * @param transport the transport
         * @return this builder
         */
        public Builder transport(HttpTransport transport) {
            this.transport = transport;
            return this;
        }

        /**
         * @param sleeper the function used to wait between retries, mainly for testing
         * @return this builder
         */
        public Builder sleeper(Sleeper sleeper) {
            this.sleeper = sleeper;
            return this;
        }

        /**
         * @return the client
         * @throws IllegalArgumentException if a key is missing or neither state code nor base URL is set
         */
        public RetailIdClient build() {
            return new RetailIdClient(this);
        }
    }

    /** @return the base URL requests are sent to, without a trailing slash */
    public String getBaseUrl() {
        return baseUrl;
    }

    /** @return the per-request timeout */
    public Duration getTimeout() {
        return timeout;
    }

    /** @return the maximum retries for retryable responses */
    public int getMaxRetries() {
        return maxRetries;
    }

    /** @return the base backoff delay */
    public Duration getBackoffBase() {
        return backoffBase;
    }

    /** @return the transport used to send requests */
    public HttpTransport getTransport() {
        return transport;
    }

    @Override
    public String toString() {
        // Never expose keys.
        return "RetailIdClient(baseUrl=" + baseUrl + ")";
    }

    /** Closes the transport if the client created it. */
    @Override
    public void close() {
        if (ownsTransport) {
            transport.close();
        }
    }

    // -- low-level -----------------------------------------------------------------

    /**
     * Sends a request and returns the decoded JSON body (or {@code null} if empty).
     *
     * @param method the HTTP method
     * @param path the path below the base URL, e.g. {@code /facilities/v2/}
     * @param licenseNumber sent as the {@code licenseNumber} query parameter, or {@code null}
     * @param params extra query parameters; {@code null} values are skipped
     * @param jsonBody the request body to send as JSON, or {@code null}
     * @param idempotent marks a call as read-only so timeouts and 5xx responses may
     *        be retried; {@code null} means true for GET and false otherwise
     * @return the decoded body: a {@code Map}, {@code List}, scalar, non-JSON {@code String}, or {@code null}
     * @throws RetailIdApiException (or a subclass) for non-2xx responses
     * @throws RetailIdTimeoutException if the request timed out
     * @throws UncheckedIOException for other network failures
     */
    public Object request(String method, String path, String licenseNumber, Map<String, ?> params,
                          Object jsonBody, Boolean idempotent) {
        method = method.toUpperCase(Locale.ROOT);
        boolean retryReads = idempotent != null ? idempotent : "GET".equals(method);
        Map<String, Object> query = new LinkedHashMap<>();
        if (licenseNumber != null) {
            query.put("licenseNumber", licenseNumber);
        }
        if (params != null) {
            for (Map.Entry<String, ?> entry : params.entrySet()) {
                if (entry.getValue() != null) {
                    query.put(entry.getKey(), entry.getValue());
                }
            }
        }
        URI uri = URI.create(baseUrl + path + queryString(query));

        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("Accept", "application/json");
        headers.put("Authorization", authorization);
        byte[] body = null;
        if (jsonBody != null) {
            headers.put("Content-Type", "application/json");
            body = Json.stringify(jsonBody).getBytes(StandardCharsets.UTF_8);
        }
        HttpTransport.Request request = new HttpTransport.Request(method, uri, headers, body, timeout);

        int attempt = 0;
        while (true) {
            long started = System.nanoTime();
            HttpTransport.Response response;
            try {
                response = transport.send(request);
            } catch (HttpTimeoutException e) {
                LOG.warning(String.format(Locale.ROOT, "%s %s license=%s timed out after %.2fs",
                    method, path, licenseNumber, elapsed(started)));
                if (retryReads && attempt < maxRetries) {
                    attempt++;
                    pause(backoff(attempt), method, path);
                    continue;
                }
                throw new RetailIdTimeoutException(method, path, e);
            } catch (IOException e) {
                throw new UncheckedIOException(method + " " + path + " failed: " + e.getMessage(), e);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(method + " " + path + " was interrupted", e);
            }

            int status = response.getStatusCode();
            if (LOG.isLoggable(Level.FINE)) {
                LOG.fine(String.format(Locale.ROOT, "%s %s license=%s -> %d in %.2fs",
                    method, path, licenseNumber, status, elapsed(started)));
            }
            if (status >= 200 && status < 300) {
                return decode(response);
            }

            RetailIdApiException error = RetailIdApiException.forStatus(
                status, decode(response), response.header("Retry-After"), method, path);
            boolean retryable = status == 429 || (status >= 500 && retryReads);
            if (retryable && attempt < maxRetries) {
                attempt++;
                Duration delay = error instanceof RateLimitException
                        && ((RateLimitException) error).getRetryAfter() != null
                    ? ((RateLimitException) error).getRetryAfter()
                    : backoff(attempt);
                LOG.info(String.format(Locale.ROOT, "%s %s -> %d, retrying in %.2fs (attempt %d/%d)",
                    method, path, status, delay.toNanos() / 1e9, attempt, maxRetries));
                pause(delay, method, path);
                continue;
            }
            throw error;
        }
    }

    /**
     * Sends a request with no license number, query parameters or body.
     *
     * @param method the HTTP method
     * @param path the path below the base URL
     * @return the decoded body
     * @see #request(String, String, String, Map, Object, Boolean)
     */
    public Object request(String method, String path) {
        return request(method, path, null, null, null, null);
    }

    private static double elapsed(long startedNanos) {
        return (System.nanoTime() - startedNanos) / 1e9;
    }

    private void pause(Duration delay, String method, String path) {
        try {
            sleeper.sleep(delay);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(method + " " + path + " was interrupted", e);
        }
    }

    private Duration backoff(int attempt) {
        // "wait a little longer after each attempt"
        double seconds = backoffBase.toNanos() / 1e9 * Math.pow(2, attempt - 1)
            + ThreadLocalRandom.current().nextDouble(0, 0.25);
        return Duration.ofNanos(Math.round(seconds * 1e9));
    }

    private static Object decode(HttpTransport.Response response) {
        String text = new String(response.getBody(), StandardCharsets.UTF_8);
        if (text.trim().isEmpty()) {
            return null;
        }
        try {
            return Json.parse(text);
        } catch (IllegalArgumentException e) {
            return text;
        }
    }

    private static String queryString(Map<String, Object> query) {
        if (query.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, Object> entry : query.entrySet()) {
            sb.append(sb.length() == 0 ? '?' : '&')
                .append(URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8))
                .append('=')
                .append(URLEncoder.encode(String.valueOf(entry.getValue()), StandardCharsets.UTF_8));
        }
        return sb.toString();
    }

    /** Percent-encodes one path segment; only unreserved characters are left as-is. */
    static String quotePathSegment(String segment) {
        StringBuilder sb = new StringBuilder();
        for (byte b : segment.getBytes(StandardCharsets.UTF_8)) {
            char c = (char) (b & 0xFF);
            if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
                    || c == '-' || c == '.' || c == '_' || c == '~') {
                sb.append(c);
            } else {
                sb.append('%').append(String.format("%02X", b & 0xFF));
            }
        }
        return sb.toString();
    }

    /**
     * Yields every record of a paged v2 list, requesting each page as the
     * previous one is consumed.
     */
    private Iterator<Object> paged(String path, String licenseNumber, Map<String, ?> params, Integer pageSize) {
        return new Iterator<Object>() {
            private final Deque<Object> buffer = new ArrayDeque<>();
            private int page = 1;
            private boolean done;

            @Override
            public boolean hasNext() {
                while (buffer.isEmpty() && !done) {
                    fetch();
                }
                return !buffer.isEmpty();
            }

            @Override
            public Object next() {
                if (!hasNext()) {
                    throw new NoSuchElementException();
                }
                return buffer.poll();
            }

            private void fetch() {
                Map<String, Object> query = new LinkedHashMap<>();
                if (params != null) {
                    query.putAll(params);
                }
                query.put("pageNumber", page);
                if (pageSize != null) {
                    query.put("pageSize", pageSize);
                }
                Object data = request("GET", path, licenseNumber, query, null, null);
                if (data instanceof List) {
                    // Unpaged response.
                    buffer.addAll((List<?>) data);
                    done = true;
                    return;
                }
                Map<String, Object> map = Json.asObject(data);
                if (map == null) {
                    done = true;
                    return;
                }
                List<Object> records = Json.asList(map.get("Data"));
                buffer.addAll(records);
                Integer totalPages = Json.asInteger(map.get("TotalPages"));
                if (records.isEmpty() || totalPages == null || page >= totalPages) {
                    done = true;
                    return;
                }
                page++;
            }
        };
    }

    /** Returns the {@code Data} list of a paged response, or the response itself if it is a list. */
    private static List<Object> dataList(Object data) {
        Map<String, Object> map = Json.asObject(data);
        if (map != null) {
            return new ArrayList<>(Json.asList(map.get("Data")));
        }
        return new ArrayList<>(Json.asList(data));
    }

    private static Map<String, Object> objectOrEmpty(Object data) {
        Map<String, Object> map = Json.asObject(data);
        return map != null ? map : Collections.emptyMap();
    }

    private static void checkBatch(String name, List<?> items) {
        if (items == null || items.isEmpty()) {
            throw new IllegalArgumentException(name + " must not be empty");
        }
        if (items.size() > MAX_RECORDS_PER_REQUEST) {
            throw new IllegalArgumentException(name + " has " + items.size() + " records; send no more than "
                + MAX_RECORDS_PER_REQUEST + " per request");
        }
    }

    // -- helpers ---------------------------------------------------------------------

    /**
     * Returns the short code from a scanned QR URL.
     *
     * <p>{@code https://1a4.com/ZScU6dsbUk98nsJEAA} becomes {@code ZScU6dsbUk98nsJEAA}.
     * A value that is already a short code is returned unchanged.
     *
     * @param qrUrlOrCode a scanned QR URL or a short code
     * @return the short code
     * @throws IllegalArgumentException if no short code is present
     */
    public static String shortCodeFromUrl(String qrUrlOrCode) {
        String value = qrUrlOrCode.trim();
        int scheme = value.indexOf("://");
        if (scheme >= 0) {
            // Keep only the path: drop scheme, host, query and fragment.
            String rest = value.substring(scheme + 3);
            int end = rest.length();
            for (char stop : new char[] {'?', '#'}) {
                int i = rest.indexOf(stop);
                if (i >= 0 && i < end) {
                    end = i;
                }
            }
            rest = rest.substring(0, end);
            int slash = rest.indexOf('/');
            value = slash >= 0 ? rest.substring(slash) : "";
        }
        int start = 0;
        int stop = value.length();
        while (start < stop && value.charAt(start) == '/') {
            start++;
        }
        while (stop > start && value.charAt(stop - 1) == '/') {
            stop--;
        }
        value = value.substring(start, stop);
        String code = value.substring(value.lastIndexOf('/') + 1);
        if (code.isEmpty()) {
            throw new IllegalArgumentException("No short code found in '" + qrUrlOrCode + "'");
        }
        return code;
    }

    // -- access check (section 2) --------------------------------------------------

    /**
     * {@code GET /facilities/v2/} — confirms the keys work and lists visible facilities.
     *
     * @return the facilities as JSON objects
     */
    public List<Object> getFacilities() {
        return dataList(request("GET", "/facilities/v2/"));
    }

    // -- label printing (section 4) ------------------------------------------------

    /**
     * {@code GET /retailid/v2/allotment} — remaining Retail Item IDs (New York only).
     *
     * @param licenseNumber the facility license number
     * @return the allotments
     */
    public List<Allotment> getAllotment(String licenseNumber) {
        Object data = request("GET", "/retailid/v2/allotment", licenseNumber, null, null, null);
        List<Object> items = data instanceof Map ? Collections.singletonList(data) : Json.asList(data);
        List<Allotment> result = new ArrayList<>();
        for (Object item : items) {
            Map<String, Object> map = Json.asObject(item);
            if (map != null) {
                result.add(Allotment.fromJson(map));
            }
        }
        return result;
    }

    /**
     * {@code POST /retailid/v2/generate} — create Retail IDs for a package.
     *
     * <p>Changes data and is not retried on timeout. If this throws
     * {@link RetailIdTimeoutException}, call {@link #getPackagesInfo} to check
     * whether the issuance was created before trying again.
     *
     * @param licenseNumber the facility license number
     * @param packageLabel the package label
     * @param quantity the number of Retail IDs to create (at least 1)
     * @return the issuance
     */
    public GenerateResult generate(String licenseNumber, String packageLabel, int quantity) {
        if (quantity < 1) {
            throw new IllegalArgumentException("quantity must be at least 1");
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("PackageLabel", packageLabel);
        body.put("Quantity", quantity);
        Object data = request("POST", "/retailid/v2/generate", licenseNumber, null, body, null);
        return GenerateResult.fromJson(objectOrEmpty(data));
    }

    /**
     * {@code POST /retailid/v2/packages/info} — Retail ID details for packages.
     *
     * <p>Read-only. Labels are sent in batches of at most {@link #MAX_RECORDS_PER_REQUEST}.
     *
     * @param licenseNumber the facility license number
     * @param packageLabels the package labels
     * @return the package details, in response order
     */
    public List<PackageInfo> getPackagesInfo(String licenseNumber, List<String> packageLabels) {
        if (packageLabels == null || packageLabels.isEmpty()) {
            throw new IllegalArgumentException("packageLabels must not be empty");
        }
        List<PackageInfo> results = new ArrayList<>();
        for (int start = 0; start < packageLabels.size(); start += MAX_RECORDS_PER_REQUEST) {
            List<String> chunk = new ArrayList<>(
                packageLabels.subList(start, Math.min(start + MAX_RECORDS_PER_REQUEST, packageLabels.size())));
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("packageLabels", chunk);
            Object data = request("POST", "/retailid/v2/packages/info", licenseNumber, null, body, true);
            Map<String, Object> map = Json.asObject(data);
            if (map != null) {
                data = map.containsKey("Data") ? map.get("Data") : Collections.singletonList(map);
            }
            for (Object item : Json.asList(data)) {
                Map<String, Object> obj = Json.asObject(item);
                if (obj != null) {
                    results.add(PackageInfo.fromJson(obj));
                }
            }
        }
        return results;
    }

    /**
     * Convenience wrapper around {@link #getPackagesInfo} for one package.
     *
     * @param licenseNumber the facility license number
     * @param packageLabel the package label
     * @return the package details, or empty if none were returned
     */
    public Optional<PackageInfo> getPackageInfo(String licenseNumber, String packageLabel) {
        List<PackageInfo> infos = getPackagesInfo(licenseNumber, Collections.singletonList(packageLabel));
        return infos.isEmpty() ? Optional.empty() : Optional.of(infos.get(0));
    }

    /**
     * {@code GET /tags/v2/package/available} — unused tags for staging labels.
     *
     * @param licenseNumber the facility license number
     * @return the tags as JSON objects
     */
    public List<Object> getAvailableTags(String licenseNumber) {
        return dataList(request("GET", "/tags/v2/package/available", licenseNumber, null, null, null));
    }

    /**
     * {@code GET /packages/v2/{label}} — one package (includes {@code ProductLabel}).
     *
     * @param licenseNumber the facility license number
     * @param idOrLabel the package ID or label
     * @return the package as a JSON object
     */
    public Object getPackage(String licenseNumber, String idOrLabel) {
        return request("GET", "/packages/v2/" + quotePathSegment(idOrLabel), licenseNumber, null, null, null);
    }

    /**
     * {@code GET /packages/v2/{id}} — one package (includes {@code ProductLabel}).
     *
     * @param licenseNumber the facility license number
     * @param id the package ID
     * @return the package as a JSON object
     */
    public Object getPackage(String licenseNumber, long id) {
        return getPackage(licenseNumber, Long.toString(id));
    }

    // -- receiving (sections 5-7) --------------------------------------------------

    /**
     * {@code GET /retailid/v2/receive/{label}} — QR URLs and receiving status.
     *
     * @param licenseNumber the facility license number
     * @param packageLabel the package label
     * @return the QR URLs and status
     */
    public ReceiveResult receive(String licenseNumber, String packageLabel) {
        Object data = request("GET", "/retailid/v2/receive/" + quotePathSegment(packageLabel),
            licenseNumber, null, null, null);
        return ReceiveResult.fromJson(objectOrEmpty(data));
    }

    /**
     * {@code GET /retailid/v2/receive/qr/{shortCode}} — receive starting from one scanned unit.
     *
     * <p>Accepts either the full scanned QR URL or the short code; only the short code is sent.
     *
     * @param licenseNumber the facility license number
     * @param qrUrlOrShortCode the scanned QR URL or its short code
     * @return the QR URLs and status of the unit's package
     */
    public ReceiveResult receiveByQr(String licenseNumber, String qrUrlOrShortCode) {
        String code = quotePathSegment(shortCodeFromUrl(qrUrlOrShortCode));
        Object data = request("GET", "/retailid/v2/receive/qr/" + code, licenseNumber, null, null, null);
        return ReceiveResult.fromJson(objectOrEmpty(data));
    }

    /**
     * {@code POST /retailid/v2/associate} — Scan and Associate units with packages.
     *
     * <p>Each entry is an {@link Association} (or a {@code Map} with
     * {@code PackageLabel} and {@code QrUrls}): a package label and the full QR
     * URLs (not short codes) of the units physically in it. At most
     * {@link #MAX_RECORDS_PER_REQUEST} entries per call. Changes data and is not
     * retried on timeout; call {@link #receive} afterwards to confirm the result.
     *
     * @param licenseNumber the facility license number
     * @param associations {@link Association} or {@code Map} entries
     * @return the raw response (the format can vary by market)
     */
    public Object associate(String licenseNumber, List<?> associations) {
        checkBatch("associations", associations);
        List<Object> body = new ArrayList<>();
        for (Object entry : associations) {
            if (entry instanceof Association) {
                body.add(((Association) entry).toJson());
            } else if (entry instanceof Map) {
                body.add(new LinkedHashMap<>((Map<?, ?>) entry));
            } else {
                throw new IllegalArgumentException("associations must contain Association or Map entries, got "
                    + (entry == null ? "null" : entry.getClass().getName()));
            }
        }
        return request("POST", "/retailid/v2/associate", licenseNumber, null, body, null);
    }

    /**
     * Convenience wrapper: associate {@code qrUrls} with one package.
     *
     * @param licenseNumber the facility license number
     * @param packageLabel the package label
     * @param qrUrls the full QR URLs of the units in the package
     * @return the raw response
     */
    public Object associatePackage(String licenseNumber, String packageLabel, List<String> qrUrls) {
        return associate(licenseNumber, Collections.singletonList(new Association(packageLabel, qrUrls)));
    }

    /**
     * {@code POST /retailid/v2/merge} — Package Merge.
     *
     * <p>The target (first) keeps and receives all Retail ID links; the source
     * (second) gives its links up. A rejection (e.g. different original package,
     * lab results, or item) is thrown as an API error and should not be resent
     * unchanged. Not retried on timeout; check both packages first.
     *
     * @param licenseNumber the facility license number
     * @param targetPackageLabel the package that keeps the links
     * @param sourcePackageLabel the package that gives its links up
     * @return the raw response, typically {@code {"Ids": [...], "Warnings": ...}}
     */
    public Object merge(String licenseNumber, String targetPackageLabel, String sourcePackageLabel) {
        if (Objects.equals(targetPackageLabel, sourcePackageLabel)) {
            throw new IllegalArgumentException("Target and source package labels must differ");
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("packageLabels", java.util.Arrays.asList(targetPackageLabel, sourcePackageLabel));
        return request("POST", "/retailid/v2/merge", licenseNumber, null, body, null);
    }

    // -- point of sale (section 8) -------------------------------------------------

    /**
     * Reports sales that include Retail IDs.
     *
     * <p>{@code records} are full sales objects built from the market's Sales
     * documentation; Retail IDs go in {@code Transactions[].QrCodes} alongside
     * {@code PackageLabel}. Not retried on timeout.
     *
     * @param licenseNumber the facility license number
     * @param records the sales records (at most {@link #MAX_RECORDS_PER_REQUEST})
     * @param endpoint one of {@link #SALES_ENDPOINTS}: {@code receipts}, {@code deliveries},
     *        {@code deliveries_retailer}, {@code deliveries_retailer_sale}
     * @return the raw response
     */
    public Object postSales(String licenseNumber, List<? extends Map<String, ?>> records, String endpoint) {
        String path = SALES_ENDPOINTS.get(endpoint);
        if (path == null) {
            throw new IllegalArgumentException("Unknown sales endpoint '" + endpoint + "'; expected one of "
                + new TreeSet<>(SALES_ENDPOINTS.keySet()));
        }
        checkBatch("records", records);
        List<Object> body = new ArrayList<>();
        for (Map<String, ?> record : records) {
            body.add(new LinkedHashMap<>(record));
        }
        return request("POST", path, licenseNumber, null, body, null);
    }

    /**
     * {@code POST /sales/v2/receipts}.
     *
     * @param licenseNumber the facility license number
     * @param receipts the receipts (at most {@link #MAX_RECORDS_PER_REQUEST})
     * @return the raw response
     */
    public Object postSalesReceipts(String licenseNumber, List<? extends Map<String, ?>> receipts) {
        return postSales(licenseNumber, receipts, "receipts");
    }

    // -- catalog (section 9) -------------------------------------------------------

    /**
     * {@code GET /globalproducts/v2?brandId=} — iterates every Global Product across all pages.
     * Pages are requested lazily as the iterator advances.
     *
     * @param brandId the brand ID
     * @param pageSize the page size to request, or {@code null} for the server default
     * @return an iterator over the products as JSON objects
     */
    public Iterator<Object> iterGlobalProducts(String brandId, Integer pageSize) {
        return paged("/globalproducts/v2", null, Collections.singletonMap("brandId", brandId), pageSize);
    }

    /**
     * @param brandId the brand ID
     * @param pageSize the page size to request, or {@code null} for the server default
     * @return an iterator over the products as JSON objects
     * @see #iterGlobalProducts(String, Integer)
     */
    public Iterator<Object> iterGlobalProducts(long brandId, Integer pageSize) {
        return iterGlobalProducts(Long.toString(brandId), pageSize);
    }

    /**
     * @param brandId the brand ID
     * @return an iterator over the products as JSON objects
     * @see #iterGlobalProducts(String, Integer)
     */
    public Iterator<Object> iterGlobalProducts(long brandId) {
        return iterGlobalProducts(Long.toString(brandId), null);
    }

    /**
     * All Global Products for a brand (every page).
     *
     * @param brandId the brand ID
     * @param pageSize the page size to request, or {@code null} for the server default
     * @return the products as JSON objects
     */
    public List<Object> getGlobalProducts(String brandId, Integer pageSize) {
        List<Object> products = new ArrayList<>();
        iterGlobalProducts(brandId, pageSize).forEachRemaining(products::add);
        return products;
    }

    /**
     * @param brandId the brand ID
     * @param pageSize the page size to request, or {@code null} for the server default
     * @return the products as JSON objects
     * @see #getGlobalProducts(String, Integer)
     */
    public List<Object> getGlobalProducts(long brandId, Integer pageSize) {
        return getGlobalProducts(Long.toString(brandId), pageSize);
    }

    /**
     * @param brandId the brand ID
     * @return the products as JSON objects
     * @see #getGlobalProducts(String, Integer)
     */
    public List<Object> getGlobalProducts(long brandId) {
        return getGlobalProducts(Long.toString(brandId), null);
    }

    /**
     * {@code GET /globalproducts/v2/{id}} — one Global Product.
     *
     * @param productId the product ID
     * @return the product as a JSON object
     */
    public Object getGlobalProduct(String productId) {
        return request("GET", "/globalproducts/v2/" + quotePathSegment(productId));
    }

    /**
     * @param productId the product ID
     * @return the product as a JSON object
     * @see #getGlobalProduct(String)
     */
    public Object getGlobalProduct(long productId) {
        return getGlobalProduct(Long.toString(productId));
    }
}
