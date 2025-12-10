package com.retailid;

/**
 * Options for encoding RetailID URLs.
 *
 * <p>Controls the domain and encoding format (base36 vs base64) used
 * when generating RetailID URLs.
 *
 * <p>Example usage:
 * <pre>
 * // Default: base36, uppercase, 1a4.com
 * EncodeOptions opts1 = new EncodeOptions();
 *
 * // Use base64 encoding
 * EncodeOptions opts2 = new EncodeOptions().setBase64(true);
 *
 * // Custom domain
 * EncodeOptions opts3 = new EncodeOptions().setDomain("abc.com");
 * </pre>
 *
 * @author Metrc LLC
 */
public class EncodeOptions {
    private String domain = "1a4.com";
    private boolean base64 = false;

    /**
     * Constructs default encoding options (base36, 1a4.com).
     */
    public EncodeOptions() {
    }

    /**
     * Returns the domain to use in the URL.
     *
     * @return the domain (default: "1a4.com")
     */
    public String getDomain() {
        return domain;
    }

    /**
     * Sets the domain to use in the URL.
     *
     * @param domain the domain (e.g., "1a4.com", "abc.com")
     * @return this options object for chaining
     */
    public EncodeOptions setDomain(String domain) {
        this.domain = domain;
        return this;
    }

    /**
     * Returns whether to use base64 encoding instead of base36.
     *
     * @return true if base64, false if base36 (default: false)
     */
    public boolean isBase64() {
        return base64;
    }

    /**
     * Sets whether to use base64 encoding instead of base36.
     *
     * @param base64 true for base64, false for base36
     * @return this options object for chaining
     */
    public EncodeOptions setBase64(boolean base64) {
        this.base64 = base64;
        return this;
    }
}
