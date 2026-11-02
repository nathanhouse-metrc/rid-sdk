package com.retailid.api;

/**
 * 404: the address, package, or code was not found.
 *
 * @author Metrc LLC
 */
public class NotFoundException extends RetailIdApiException {
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
    public NotFoundException(int statusCode, String message, String method, String path, Object body) {
        super(statusCode, message, method, path, body);
    }
}
