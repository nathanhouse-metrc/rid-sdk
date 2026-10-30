package com.retailid.api;

import java.util.Map;

/**
 * One Generate run recorded against a package.
 *
 * @author Metrc LLC
 */
public final class Issuance {
    private final Integer labelSet;
    private final Integer labelQuantity;
    private final String createdAt;
    private final Map<String, Object> raw;

    /**
     * @param labelSet the label set number, or {@code null}
     * @param labelQuantity the number of labels generated, or {@code null}
     * @param createdAt the creation timestamp as returned by the API, or {@code null}
     * @param raw the full response object
     */
    public Issuance(Integer labelSet, Integer labelQuantity, String createdAt, Map<String, Object> raw) {
        this.labelSet = labelSet;
        this.labelQuantity = labelQuantity;
        this.createdAt = createdAt;
        this.raw = Json.readOnly(raw);
    }

    /**
     * Builds an issuance from a decoded JSON object.
     *
     * @param data the JSON object
     * @return the issuance
     */
    public static Issuance fromJson(Map<String, Object> data) {
        return new Issuance(
            Json.asInteger(data.get("LabelSet")),
            Json.asInteger(data.get("LabelQuantity")),
            Json.asString(data.get("CreatedAt")),
            data);
    }

    /** @return the label set number, or {@code null} */
    public Integer getLabelSet() {
        return labelSet;
    }

    /** @return the number of labels generated, or {@code null} */
    public Integer getLabelQuantity() {
        return labelQuantity;
    }

    /** @return the creation timestamp as returned by the API, or {@code null} */
    public String getCreatedAt() {
        return createdAt;
    }

    /** @return the full response object, including fields not modeled here */
    public Map<String, Object> getRaw() {
        return raw;
    }

    @Override
    public String toString() {
        return "Issuance(labelSet=" + labelSet + ", labelQuantity=" + labelQuantity
            + ", createdAt=" + createdAt + ")";
    }
}
