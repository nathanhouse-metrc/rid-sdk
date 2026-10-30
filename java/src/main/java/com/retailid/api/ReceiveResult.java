package com.retailid.api;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * A package's QR URLs and receiving status.
 *
 * @author Metrc LLC
 */
public final class ReceiveResult {
    private final List<String> eaches;
    private final List<String> siblingTags;
    private final boolean requiresVerification;
    private final String childTag;
    private final String labelSource;
    private final Integer qrCount;
    private final Object ranges;
    private final Map<String, Object> raw;

    /**
     * @param eaches the QR URLs of the units, in print order
     * @param siblingTags labels of sibling packages
     * @param requiresVerification whether Scan and Associate is required
     * @param childTag the child package label, or {@code null}
     * @param labelSource where the labels came from, or {@code null}
     * @param qrCount the number of Retail IDs, or {@code null}
     * @param ranges the raw {@code Ranges} value, or {@code null}
     * @param raw the full response object
     */
    public ReceiveResult(List<String> eaches, List<String> siblingTags, boolean requiresVerification,
                         String childTag, String labelSource, Integer qrCount, Object ranges,
                         Map<String, Object> raw) {
        this.eaches = Collections.unmodifiableList(new ArrayList<>(eaches));
        this.siblingTags = Collections.unmodifiableList(new ArrayList<>(siblingTags));
        this.requiresVerification = requiresVerification;
        this.childTag = childTag;
        this.labelSource = labelSource;
        this.qrCount = qrCount;
        this.ranges = ranges;
        this.raw = Json.readOnly(raw);
    }

    /**
     * Builds a receive result from a decoded JSON object.
     *
     * @param data the JSON object
     * @return the receive result
     */
    public static ReceiveResult fromJson(Map<String, Object> data) {
        return new ReceiveResult(
            strings(data.get("Eaches")),
            strings(data.get("SiblingTags")),
            Json.truthy(data.get("RequiresVerification")),
            Json.asString(data.get("ChildTag")),
            Json.asString(data.get("LabelSource")),
            Json.asInteger(data.get("QrCount")),
            data.get("Ranges"),
            data);
    }

    private static List<String> strings(Object value) {
        List<String> result = new ArrayList<>();
        for (Object item : Json.asList(value)) {
            result.add(item == null ? null : item.toString());
        }
        return result;
    }

    /** @return the QR URLs of the units; print one label per URL, exactly as returned */
    public List<String> getEaches() {
        return eaches;
    }

    /** @return labels of sibling packages */
    public List<String> getSiblingTags() {
        return siblingTags;
    }

    /** @return whether the package must be verified with Scan and Associate */
    public boolean requiresVerification() {
        return requiresVerification;
    }

    /** @return the child package label, or {@code null} */
    public String getChildTag() {
        return childTag;
    }

    /** @return where the labels came from, or {@code null} */
    public String getLabelSource() {
        return labelSource;
    }

    /** @return the number of Retail IDs, or {@code null} */
    public Integer getQrCount() {
        return qrCount;
    }

    /** @return the raw {@code Ranges} value, or {@code null} */
    public Object getRanges() {
        return ranges;
    }

    /** @return the full response object, including fields not modeled here */
    public Map<String, Object> getRaw() {
        return raw;
    }

    @Override
    public String toString() {
        return "ReceiveResult(eaches=" + eaches + ", siblingTags=" + siblingTags
            + ", requiresVerification=" + requiresVerification + ", childTag=" + childTag
            + ", labelSource=" + labelSource + ", qrCount=" + qrCount + ")";
    }
}
