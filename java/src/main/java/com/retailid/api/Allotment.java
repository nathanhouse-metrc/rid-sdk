package com.retailid.api;

import java.util.Map;

/**
 * A New York facility's remaining Retail Item ID allotment.
 *
 * @author Metrc LLC
 */
public final class Allotment {
    private final Integer facilityId;
    private final String facilityLicenseNumber;
    private final int allotment;
    private final Map<String, Object> raw;

    /**
     * @param facilityId the facility ID, or {@code null}
     * @param facilityLicenseNumber the facility license number, or {@code null}
     * @param allotment the remaining Retail Item IDs
     * @param raw the full response object
     */
    public Allotment(Integer facilityId, String facilityLicenseNumber, int allotment, Map<String, Object> raw) {
        this.facilityId = facilityId;
        this.facilityLicenseNumber = facilityLicenseNumber;
        this.allotment = allotment;
        this.raw = Json.readOnly(raw);
    }

    /**
     * Builds an allotment from a decoded JSON object.
     *
     * @param data the JSON object
     * @return the allotment
     */
    public static Allotment fromJson(Map<String, Object> data) {
        Integer allotment = Json.asInteger(data.get("Allotment"));
        return new Allotment(
            Json.asInteger(data.get("FacilityId")),
            Json.asString(data.get("FacilityLicenseNumber")),
            allotment == null ? 0 : allotment,
            data);
    }

    /** @return the facility ID, or {@code null} */
    public Integer getFacilityId() {
        return facilityId;
    }

    /** @return the facility license number, or {@code null} */
    public String getFacilityLicenseNumber() {
        return facilityLicenseNumber;
    }

    /** @return the number of Retail Item IDs remaining */
    public int getAllotment() {
        return allotment;
    }

    /** @return the full response object, including fields not modeled here */
    public Map<String, Object> getRaw() {
        return raw;
    }

    @Override
    public String toString() {
        return "Allotment(facilityId=" + facilityId + ", facilityLicenseNumber=" + facilityLicenseNumber
            + ", allotment=" + allotment + ")";
    }
}
