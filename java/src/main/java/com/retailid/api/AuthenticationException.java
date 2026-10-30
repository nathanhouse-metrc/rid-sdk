package com.retailid.api;

/**
 * 401: the API keys were not accepted.
 *
 * @author Metrc LLC
 */
public class AuthenticationException extends RetailIdApiException {
    private static final long serialVersionUID = 1L;

    /**
     * Creates the error.
     *
     * @param statusCode the HTTP status code
     * @param message the error message from the response
     * @param method the HTTP method
     * @param path the request path
     * @param body the decoded response body
     */
    public AuthenticationException(int statusCode, String message, String method, String path, Object body) {
        super(statusCode, message, method, path, body);
    }
}
