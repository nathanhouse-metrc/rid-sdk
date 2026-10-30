package com.retailid.api;

/**
 * Thrown when a {@code config.json} file is missing, unreadable, or incomplete.
 *
 * @author Metrc LLC
 */
public class RetailIdConfigException extends IllegalArgumentException {
    private static final long serialVersionUID = 1L;

    /**
     * @param message the description of the problem
     */
    public RetailIdConfigException(String message) {
        super(message);
    }

    /**
     * @param message the description of the problem
     * @param cause the underlying error
     */
    public RetailIdConfigException(String message, Throwable cause) {
        super(message, cause);
    }
}
