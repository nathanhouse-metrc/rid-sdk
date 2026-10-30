package com.retailid.api;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Retail ID details for a package, as returned by {@code packages/info}.
 *
 * @author Metrc LLC
 */
public final class PackageInfo {
    private final String packageLabel;
    private final int qrCount;
    private final boolean hasQrs;
    private final List<Issuance> issuances;
    private final Integer siblingCount;
    private final boolean requiresVerification;
    private final Integer estimatedBalance;
    private final Map<String, Object> raw;

    /**
     * @param packageLabel the package label, or {@code null}
     * @param qrCount the number of Retail IDs on the package
     * @param hasQrs whether the package has Retail IDs
     * @param issuances the Generate runs recorded against the package
     * @param siblingCount the number of sibling packages, or {@code null}
     * @param requiresVerification whether Scan and Associate is required
     * @param estimatedBalance the estimated unit balance, or {@code null}
     * @param raw the full response object
     */
    public PackageInfo(String packageLabel, int qrCount, boolean hasQrs, List<Issuance> issuances,
                       Integer siblingCount, boolean requiresVerification, Integer estimatedBalance,
                       Map<String, Object> raw) {
        this.packageLabel = packageLabel;
        this.qrCount = qrCount;
        this.hasQrs = hasQrs;
        this.issuances = Collections.unmodifiableList(new ArrayList<>(issuances));
        this.siblingCount = siblingCount;
        this.requiresVerification = requiresVerification;
        this.estimatedBalance = estimatedBalance;
        this.raw = Json.readOnly(raw);
    }

    /**
     * Builds package info from a decoded JSON object.
     *
     * @param data the JSON object
     * @return the package info
     */
    public static PackageInfo fromJson(Map<String, Object> data) {
        List<Issuance> issuances = new ArrayList<>();
        for (Object item : Json.asList(data.get("Issuances"))) {
            Map<String, Object> obj = Json.asObject(item);
            if (obj != null) {
                issuances.add(Issuance.fromJson(obj));
            }
        }
        Integer qrCount = Json.asInteger(data.get("QrCount"));
        return new PackageInfo(
            Json.asString(Json.or(data.get("PackageLabel"), data.get("Label"))),
            qrCount == null ? 0 : qrCount,
            Json.truthy(data.get("HasQrs")),
            issuances,
            Json.asInteger(data.get("SiblingCount")),
            Json.truthy(data.get("RequiresVerification")),
            Json.asInteger(data.get("EstimatedBalance")),
            data);
    }

    /** @return the package label, or {@code null} */
    public String getPackageLabel() {
        return packageLabel;
    }

    /** @return the number of Retail IDs on the package */
    public int getQrCount() {
        return qrCount;
    }

    /** @return whether the package has Retail IDs */
    public boolean hasQrs() {
        return hasQrs;
    }

    /** @return the Generate runs recorded against the package */
    public List<Issuance> getIssuances() {
        return issuances;
    }

    /** @return the number of sibling packages, or {@code null} */
    public Integer getSiblingCount() {
        return siblingCount;
    }

    /** @return whether the package must be verified with Scan and Associate */
    public boolean requiresVerification() {
        return requiresVerification;
    }

    /** @return the estimated unit balance, or {@code null} */
    public Integer getEstimatedBalance() {
        return estimatedBalance;
    }

    /** @return the full response object, including fields not modeled here */
    public Map<String, Object> getRaw() {
        return raw;
    }

    @Override
    public String toString() {
        return "PackageInfo(packageLabel=" + packageLabel + ", qrCount=" + qrCount + ", hasQrs=" + hasQrs
            + ", issuances=" + issuances + ", siblingCount=" + siblingCount
            + ", requiresVerification=" + requiresVerification + ", estimatedBalance=" + estimatedBalance + ")";
    }
}
