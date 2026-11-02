package com.retailid.api;

import java.util.Map;

/**
 * Result of one Generate run (an issuance).
 *
 * @author Metrc LLC
 */
public final class GenerateResult {
    private final String issuanceId;
    private final Map<String, Object> raw;

    /**
     * @param issuanceId the issuance ID
     * @param raw the full response object
     */
    public GenerateResult(String issuanceId, Map<String, Object> raw) {
        this.issuanceId = issuanceId;
        this.raw = Json.readOnly(raw);
    }

    /**
     * Builds a result from a decoded JSON object.
     *
     * @param data the JSON object
     * @return the result
     */
    public static GenerateResult fromJson(Map<String, Object> data) {
        Object id = data.get("IssuanceId");
        return new GenerateResult(id == null ? "" : id.toString(), data);
    }

    /** @return the issuance ID (empty if the response did not include one) */
    public String getIssuanceId() {
        return issuanceId;
    }

    /** @return the full response object, including fields not modeled here */
    public Map<String, Object> getRaw() {
        return raw;
    }

    @Override
    public String toString() {
        return "GenerateResult(issuanceId=" + issuanceId + ")";
    }
}
