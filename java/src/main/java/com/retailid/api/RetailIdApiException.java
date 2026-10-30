package com.retailid.api;

import java.util.List;
import java.util.Map;

/**
 * Thrown when the Retail ID API returns a non-success status code
 * (section 11 of the integration guide).
 *
 * <p>Use {@link #forStatus} to build the subclass that matches a status code:
 * {@link BadRequestException} (400), {@link AuthenticationException} (401),
 * {@link PermissionDeniedException} (403), {@link NotFoundException} (404),
 * {@link ConflictException} (409), {@link UnprocessableException} (422),
 * {@link RateLimitException} (429) and {@link ServerException} (5xx).
 *
 * @author Metrc LLC
 */
public class RetailIdApiException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    private final int statusCode;
    private final String apiMessage;
    private final String method;
    private final String path;
    private final transient Object body;

    /**
     * Creates an API error.
     *
     * @param statusCode the HTTP status code
     * @param message the error message from the response (or a default)
     * @param method the HTTP method, may be empty
     * @param path the request path, may be empty
     * @param body the decoded response body, may be {@code null}
     */
    public RetailIdApiException(int statusCode, String message, String method, String path, Object body) {
        super((statusCode + " " + nullToEmpty(method) + " " + nullToEmpty(path)).trim() + ": " + message);
        this.statusCode = statusCode;
        this.apiMessage = message;
        this.method = nullToEmpty(method);
        this.path = nullToEmpty(path);
        this.body = body;
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }

    /** @return the HTTP status code */
    public int getStatusCode() {
        return statusCode;
    }

    /** @return the error message returned by the API (without status, method or path) */
    public String getApiMessage() {
        return apiMessage;
    }

    /** @return the HTTP method of the failed request */
    public String getMethod() {
        return method;
    }

    /** @return the path of the failed request */
    public String getPath() {
        return path;
    }

    /** @return the decoded response body (a {@code Map}, {@code List}, {@code String} or {@code null}) */
    public Object getBody() {
        return body;
    }

    /**
     * Builds the error for a non-2xx response.
     *
     * @param status the HTTP status code
     * @param payload the decoded response body
     * @param retryAfter the {@code Retry-After} header value, or {@code null}
     * @param method the HTTP method
     * @param path the request path
     * @return the matching exception (not thrown)
     */
    public static RetailIdApiException forStatus(int status, Object payload, String retryAfter,
                                                 String method, String path) {
        String message = messageFrom(payload);
        switch (status) {
            case 400: return new BadRequestException(status, message, method, path, payload);
            case 401: return new AuthenticationException(status, message, method, path, payload);
            case 403: return new PermissionDeniedException(status, message, method, path, payload);
            case 404: return new NotFoundException(status, message, method, path, payload);
            case 409: return new ConflictException(status, message, method, path, payload);
            case 422: return new UnprocessableException(status, message, method, path, payload);
            case 429:
                return new RateLimitException(status, message, method, path, payload,
                    RateLimitException.parseRetryAfter(retryAfter));
            default:
                if (status >= 500) {
                    return new ServerException(status, message, method, path, payload);
                }
                return new RetailIdApiException(status, message, method, path, payload);
        }
    }

    /**
     * Builds the error for a non-2xx response with no method or path.
     *
     * @param status the HTTP status code
     * @param payload the decoded response body
     * @param retryAfter the {@code Retry-After} header value, or {@code null}
     * @return the matching exception (not thrown)
     */
    public static RetailIdApiException forStatus(int status, Object payload, String retryAfter) {
        return forStatus(status, payload, retryAfter, "", "");
    }

    static String messageFrom(Object payload) {
        String message = "";
        if (payload instanceof Map) {
            Map<?, ?> map = (Map<?, ?>) payload;
            message = String.valueOf(Json.or(map.get("Message"), Json.or(map.get("message"), "")));
        } else if (payload instanceof List
                && !((List<?>) payload).isEmpty()
                && ((List<?>) payload).get(0) instanceof Map) {
            StringBuilder sb = new StringBuilder();
            for (Object item : (List<?>) payload) {
                if (sb.length() > 0) {
                    sb.append("; ");
                }
                if (item instanceof Map) {
                    Map<?, ?> map = (Map<?, ?>) item;
                    sb.append(Json.or(map.get("message"), Json.or(map.get("Message"), "")));
                }
            }
            message = sb.toString();
        } else if (payload instanceof String) {
            message = (String) payload;
        }
        return message.isEmpty() ? "Request failed" : message;
    }
}
