package com.retailid.api;

import java.time.Duration;

/**
 * 429: too many requests.
 *
 * @author Metrc LLC
 */
public class RateLimitException extends RetailIdApiException {
    private static final long serialVersionUID = 1L;

    private final Duration retryAfter;

    /**
     * Creates the error.
     *
     * @param statusCode the HTTP status code
     * @param message the error message from the response
     * @param method the HTTP method
     * @param path the request path
     * @param body the decoded response body
     * @param retryAfter the delay from the {@code Retry-After} header, or {@code null}
     */
    public RateLimitException(int statusCode, String message, String method, String path, Object body,
                              Duration retryAfter) {
        super(statusCode, message, method, path, body);
        this.retryAfter = retryAfter;
    }

    /** @return the delay requested by the {@code Retry-After} header, or {@code null} if none was sent */
    public Duration getRetryAfter() {
        return retryAfter;
    }

    static Duration parseRetryAfter(String value) {
        if (value == null) {
            return null;
        }
        try {
            double seconds = Math.max(0.0, Double.parseDouble(value.trim()));
            return Duration.ofNanos(Math.round(seconds * 1_000_000_000L));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
