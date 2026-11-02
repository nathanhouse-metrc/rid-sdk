package com.retailid.api;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.UnaryOperator;

/**
 * Retail ID API credentials and connection settings, usually loaded from {@code config.json}.
 *
 * <p>Keep API keys out of source code: put them in a {@code config.json} that is
 * not committed (see {@code config.example.json}):
 * <pre>
 * {
 *     "vendor_api_key": "...",
 *     "user_api_key": "...",
 *     "state_code": "md"
 * }
 * </pre>
 *
 * <p>{@code base_url} may be given instead of {@code state_code} (use it for the
 * Sandbox). {@code timeout} (seconds), {@code max_retries} and
 * {@code backoff_base} (seconds) are optional.
 *
 * @author Metrc LLC
 */
public final class RetailIdConfig {

    /** File read by {@link #load()} when {@link #CONFIG_ENV_VAR} is not set. */
    public static final String DEFAULT_CONFIG_FILE = "config.json";

    /** Environment variable that points at the config file when no path is passed. */
    public static final String CONFIG_ENV_VAR = "RETAILID_CONFIG";

    static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(30);
    static final int DEFAULT_MAX_RETRIES = 3;
    static final Duration DEFAULT_BACKOFF_BASE = Duration.ofSeconds(1);

    private final String vendorApiKey;
    private final String userApiKey;
    private final String stateCode;
    private final String baseUrl;
    private final Duration timeout;
    private final int maxRetries;
    private final Duration backoffBase;

    /**
     * Creates a config with default timeout, retries and backoff.
     *
     * @param vendorApiKey the vendor (software) API key
     * @param userApiKey the API key of the Metrc user making requests
     * @param stateCode the market code, e.g. {@code "md"}; may be {@code null} if {@code baseUrl} is set
     * @param baseUrl the full base URL; overrides {@code stateCode}; may be {@code null}
     */
    public RetailIdConfig(String vendorApiKey, String userApiKey, String stateCode, String baseUrl) {
        this(vendorApiKey, userApiKey, stateCode, baseUrl,
            DEFAULT_TIMEOUT, DEFAULT_MAX_RETRIES, DEFAULT_BACKOFF_BASE);
    }

    /**
     * Creates a config.
     *
     * @param vendorApiKey the vendor (software) API key
     * @param userApiKey the API key of the Metrc user making requests
     * @param stateCode the market code, e.g. {@code "md"}; may be {@code null} if {@code baseUrl} is set
     * @param baseUrl the full base URL; overrides {@code stateCode}; may be {@code null}
     * @param timeout the per-request timeout
     * @param maxRetries the maximum retries for retryable responses
     * @param backoffBase the base delay when no {@code Retry-After} is sent
     */
    public RetailIdConfig(String vendorApiKey, String userApiKey, String stateCode, String baseUrl,
                          Duration timeout, int maxRetries, Duration backoffBase) {
        this.vendorApiKey = vendorApiKey;
        this.userApiKey = userApiKey;
        this.stateCode = stateCode;
        this.baseUrl = baseUrl;
        this.timeout = timeout;
        this.maxRetries = maxRetries;
        this.backoffBase = backoffBase;
    }

    /**
     * Builds a config from a decoded {@code config.json} object.
     *
     * @param data the JSON object
     * @return the config
     * @throws RetailIdConfigException if required keys are missing
     */
    public static RetailIdConfig fromMap(Map<String, ?> data) {
        List<String> missing = new ArrayList<>();
        for (String key : new String[] {"vendor_api_key", "user_api_key"}) {
            if (!Json.truthy(data.get(key))) {
                missing.add(key);
            }
        }
        if (!missing.isEmpty()) {
            throw new RetailIdConfigException("Config is missing required keys: " + String.join(", ", missing));
        }
        if (!Json.truthy(data.get("state_code")) && !Json.truthy(data.get("base_url"))) {
            throw new RetailIdConfigException("Config must set either state_code or base_url");
        }
        try {
            return new RetailIdConfig(
                data.get("vendor_api_key").toString(),
                data.get("user_api_key").toString(),
                Json.truthy(data.get("state_code")) ? data.get("state_code").toString() : null,
                Json.truthy(data.get("base_url")) ? data.get("base_url").toString() : null,
                seconds(data.get("timeout"), DEFAULT_TIMEOUT),
                data.get("max_retries") == null
                    ? DEFAULT_MAX_RETRIES
                    : (int) Double.parseDouble(data.get("max_retries").toString()),
                seconds(data.get("backoff_base"), DEFAULT_BACKOFF_BASE));
        } catch (NumberFormatException e) {
            throw new RetailIdConfigException("Config has a non-numeric setting: " + e.getMessage(), e);
        }
    }

    private static Duration seconds(Object value, Duration fallback) {
        if (value == null) {
            return fallback;
        }
        double seconds = Double.parseDouble(value.toString());
        return Duration.ofNanos(Math.round(seconds * 1_000_000_000L));
    }

    /**
     * Reads the file named by {@code $RETAILID_CONFIG}, or {@code ./config.json}.
     *
     * @return the config
     * @throws RetailIdConfigException if the file is missing, is not valid JSON, or lacks the keys or location
     */
    public static RetailIdConfig load() {
        return load(null, System::getenv);
    }

    /**
     * Reads a config file.
     *
     * @param path the file to read; {@code null} reads {@code $RETAILID_CONFIG} or {@code ./config.json}
     * @return the config
     * @throws RetailIdConfigException if the file is missing, is not valid JSON, or lacks the keys or location
     */
    public static RetailIdConfig load(Path path) {
        return load(path, System::getenv);
    }

    static RetailIdConfig load(Path path, UnaryOperator<String> env) {
        if (path == null) {
            String fromEnv = env.apply(CONFIG_ENV_VAR);
            path = Paths.get(fromEnv != null && !fromEnv.isEmpty() ? fromEnv : DEFAULT_CONFIG_FILE);
        }
        String text;
        try {
            text = new String(Files.readAllBytes(path), StandardCharsets.UTF_8);
        } catch (NoSuchFileException e) {
            throw new RetailIdConfigException("Config file not found: " + path, e);
        } catch (IOException e) {
            throw new RetailIdConfigException("Config file could not be read: " + path + ": " + e, e);
        }
        Object data;
        try {
            data = Json.parse(text);
        } catch (IllegalArgumentException e) {
            throw new RetailIdConfigException(
                "Config file is not valid JSON: " + path + ": " + e.getMessage(), e);
        }
        Map<String, Object> object = Json.asObject(data);
        if (object == null) {
            throw new RetailIdConfigException("Config file must contain a JSON object: " + path);
        }
        return fromMap(object);
    }

    /** @return the vendor (software) API key */
    public String getVendorApiKey() {
        return vendorApiKey;
    }

    /** @return the API key of the Metrc user making requests */
    public String getUserApiKey() {
        return userApiKey;
    }

    /** @return the market code, or {@code null} */
    public String getStateCode() {
        return stateCode;
    }

    /** @return the full base URL, or {@code null} */
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

    @Override
    public String toString() {
        // Never expose keys.
        return "RetailIdConfig(stateCode=" + stateCode + ", baseUrl=" + baseUrl
            + ", timeout=" + timeout + ", maxRetries=" + maxRetries + ")";
    }
}
