package com.retailid.api;

/**
 * Thrown when a request times out before a reply.
 *
 * <p>For calls that change data (generate, associate, merge, sales) the request
 * may still have been applied. Check the current state
 * ({@link RetailIdClient#getPackagesInfo} or {@link RetailIdClient#receive})
 * before resending.
 *
 * @author Metrc LLC
 */
public class RetailIdTimeoutException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    private final String method;
    private final String path;

    /**
     * Creates the error.
     *
     * @param method the HTTP method
     * @param path the request path
     * @param cause the underlying timeout
     */
    public RetailIdTimeoutException(String method, String path, Throwable cause) {
        super(method + " " + path + " timed out: " + cause, cause);
        this.method = method;
        this.path = path;
    }

    /** @return the HTTP method of the request that timed out */
    public String getMethod() {
        return method;
    }

    /** @return the path of the request that timed out */
    public String getPath() {
        return path;
    }
}
