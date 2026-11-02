package com.retailid.api;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * One entry of a Scan and Associate request: a package and the units in it.
 *
 * @author Metrc LLC
 */
public final class Association {
    private final String packageLabel;
    private final List<String> qrUrls;

    /**
     * @param packageLabel the package label
     * @param qrUrls the full QR URLs (not short codes) of the units physically in the package
     */
    public Association(String packageLabel, List<String> qrUrls) {
        this.packageLabel = Objects.requireNonNull(packageLabel, "packageLabel");
        this.qrUrls = Collections.unmodifiableList(new ArrayList<>(Objects.requireNonNull(qrUrls, "qrUrls")));
    }

    /** @return the package label */
    public String getPackageLabel() {
        return packageLabel;
    }

    /** @return the full QR URLs of the units in the package */
    public List<String> getQrUrls() {
        return qrUrls;
    }

    /** @return the request body object: {@code {"PackageLabel": ..., "QrUrls": [...]}} */
    public Map<String, Object> toJson() {
        Map<String, Object> json = new LinkedHashMap<>();
        json.put("PackageLabel", packageLabel);
        json.put("QrUrls", new ArrayList<>(qrUrls));
        return json;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof Association)) {
            return false;
        }
        Association other = (Association) o;
        return packageLabel.equals(other.packageLabel) && qrUrls.equals(other.qrUrls);
    }

    @Override
    public int hashCode() {
        return Objects.hash(packageLabel, qrUrls);
    }

    @Override
    public String toString() {
        return "Association(packageLabel=" + packageLabel + ", qrUrls=" + qrUrls + ")";
    }
}
