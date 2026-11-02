package com.retailid.api;

import static com.retailid.api.FakeTransport.ok;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Tests for the Retail ID API client, using examples from the integration guide.
 * Mirrors the Python SDK's {@code tests/test_api.py}.
 */
class RetailIdClientTest {

    static final String LICENSE = "837-XYZ";
    static final String LABEL = "1A4060300007777000000001";
    static final String SOURCE_LABEL = "1A4080300007747000000001";
    static final String QR_A = "https://1a4.com/ZScU6dsbUk98nsJEAA";
    static final String QR_B = "https://1a4.com/ZScU6dsbUk98nsJEAB";
    static final String QR_C = "https://1a4.com/ZScU6dsbUk98nsJEAC";

    /** A client wired to a fake transport and a recording sleeper. */
    static final class Harness {
        final FakeTransport transport;
        final List<Duration> sleeps = new ArrayList<>();
        final RetailIdClient client;

        Harness(RetailIdClient.Builder builder, Object... responses) {
            this.transport = new FakeTransport(responses);
            this.client = builder.transport(transport).sleeper(sleeps::add).build();
        }

        FakeTransport.Call call(int i) {
            return transport.calls.get(i);
        }
    }

    static RetailIdClient.Builder md() {
        return RetailIdClient.builder("vendor-key", "user-key").stateCode("md");
    }

    static Harness make(Object... responses) {
        return new Harness(md(), responses);
    }

    static double seconds(Duration d) {
        return d.toNanos() / 1e9;
    }

    static <K, V> Map<K, V> map(Object... kv) {
        Map<K, V> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            @SuppressWarnings("unchecked")
            K k = (K) kv[i];
            @SuppressWarnings("unchecked")
            V v = (V) kv[i + 1];
            m.put(k, v);
        }
        return m;
    }

    /** JSON round trip, so expected values compare equal to what the client decoded. */
    static Object json(Object value) {
        return Json.parse(Json.stringify(value));
    }

    @Nested
    class ClientSetup {
        @Test
        void baseUrlFromStateCode() {
            assertEquals("https://api-md.metrc.com", make().client.getBaseUrl());
        }

        @Test
        void baseUrlOverride() {
            RetailIdClient client = RetailIdClient.builder("v", "u")
                .baseUrl("https://sandbox-api-md.metrc.com/").build();
            assertEquals("https://sandbox-api-md.metrc.com", client.getBaseUrl());
        }

        @Test
        void requiresKeysAndLocation() {
            assertThrows(IllegalArgumentException.class,
                () -> RetailIdClient.builder("", "u").stateCode("md").build());
            assertThrows(IllegalArgumentException.class,
                () -> RetailIdClient.builder("v", "u").build());
        }

        @Test
        void basicAuthHeaderAndToStringHideKeys() {
            Harness h = make(ok(Collections.emptyList()));
            h.client.getFacilities();
            String expected = Base64.getEncoder()
                .encodeToString("vendor-key:user-key".getBytes(StandardCharsets.UTF_8));
            assertEquals("Basic " + expected, h.call(0).headers.get("Authorization"));
            assertEquals("application/json", h.call(0).headers.get("Accept"));
            assertFalse(h.client.toString().contains("vendor-key"));
            assertFalse(h.client.toString().contains("user-key"));
        }

        @Test
        void timeoutIsPassedToTransport() {
            Harness h = new Harness(md().timeout(Duration.ofMillis(12500)), ok(Collections.emptyList()));
            h.client.getFacilities();
            assertEquals(Duration.ofMillis(12500), h.call(0).timeout);
        }

        @Test
        void closeOnlyClosesOwnedTransport() {
            FakeTransport transport = new FakeTransport();
            try (RetailIdClient client = md().transport(transport).build()) {
                assertSame(transport, client.getTransport());
            }
            assertFalse(transport.closed);
            RetailIdClient owned = md().build();
            assertInstanceOf(JdkHttpTransport.class, owned.getTransport());
            owned.close();
        }
    }

    @Nested
    class Config {
        @TempDir
        Path tmp;

        Path write(Object data) throws IOException {
            Path path = tmp.resolve("config.json");
            Files.write(path, Json.stringify(data).getBytes(StandardCharsets.UTF_8));
            return path;
        }

        @Test
        void fromConfigFile() throws IOException {
            Path path = write(map("vendor_api_key", "vendor-key", "user_api_key", "user-key",
                "state_code", "co", "timeout", 5, "max_retries", 1));
            FakeTransport transport = new FakeTransport(ok(Collections.emptyList()));
            RetailIdClient client = RetailIdClient.builder(RetailIdConfig.load(path)).transport(transport).build();
            assertEquals("https://api-co.metrc.com", client.getBaseUrl());
            assertEquals(Duration.ofSeconds(5), client.getTimeout());
            assertEquals(1, client.getMaxRetries());
            client.getFacilities();
            String expected = Base64.getEncoder()
                .encodeToString("vendor-key:user-key".getBytes(StandardCharsets.UTF_8));
            assertEquals("Basic " + expected, transport.calls.get(0).headers.get("Authorization"));
            assertEquals("https://api-co.metrc.com", RetailIdClient.fromConfig(path).getBaseUrl());
        }

        @Test
        void builderSettingsOverrideConfig() throws IOException {
            Path path = write(map("vendor_api_key", "v", "user_api_key", "u", "state_code", "md", "timeout", 5));
            RetailIdClient client = RetailIdClient.builder(RetailIdConfig.load(path))
                .timeout(Duration.ofSeconds(10)).build();
            assertEquals(Duration.ofSeconds(10), client.getTimeout());
        }

        @Test
        void baseUrlAndEnvVar() throws IOException {
            Path path = write(map("vendor_api_key", "v", "user_api_key", "u",
                "base_url", "https://sandbox.example/"));
            Map<String, String> env = new HashMap<>();
            env.put(RetailIdConfig.CONFIG_ENV_VAR, path.toString());
            RetailIdConfig config = RetailIdConfig.load(null, env::get);
            assertEquals("https://sandbox.example/", config.getBaseUrl());
            assertEquals("https://sandbox.example", RetailIdClient.fromConfig(config).getBaseUrl());
        }

        @Test
        void defaults() throws IOException {
            RetailIdConfig config = RetailIdConfig.load(
                write(map("vendor_api_key", "v", "user_api_key", "u", "state_code", "md", "base_url", null)));
            assertNull(config.getBaseUrl());
            assertEquals(Duration.ofSeconds(30), config.getTimeout());
            assertEquals(3, config.getMaxRetries());
            assertEquals(Duration.ofSeconds(1), config.getBackoffBase());
        }

        @Test
        void toStringHidesKeys() {
            RetailIdConfig config = new RetailIdConfig("vendor-key", "user-key", "md", null);
            assertFalse(config.toString().contains("vendor-key"));
            assertFalse(config.toString().contains("user-key"));
        }

        @Test
        void invalidConfig() throws IOException {
            List<Object> cases = Arrays.asList(
                map("user_api_key", "u", "state_code", "md"),
                map("vendor_api_key", "v", "user_api_key", "", "state_code", "md"),
                map("vendor_api_key", "v", "user_api_key", "u"),
                Arrays.asList("not", "an", "object"));
            for (Object data : cases) {
                Path path = write(data);
                assertThrows(RetailIdConfigException.class, () -> RetailIdConfig.load(path), data.toString());
            }
        }

        @Test
        void missingAndMalformedFile() throws IOException {
            RetailIdConfigException missing = assertThrows(RetailIdConfigException.class,
                () -> RetailIdConfig.load(tmp.resolve("nope.json")));
            assertTrue(missing.getMessage().contains("not found"));
            Path bad = tmp.resolve("bad.json");
            Files.write(bad, "{".getBytes(StandardCharsets.UTF_8));
            RetailIdConfigException malformed = assertThrows(RetailIdConfigException.class,
                () -> RetailIdConfig.load(bad));
            assertTrue(malformed.getMessage().contains("not valid JSON"));
        }
    }

    @Nested
    class LabelPrinting {
        @Test
        void getFacilities() {
            Object facility = map("License", map("Number", LICENSE));
            Harness h = make(ok(Collections.singletonList(facility)));
            assertEquals(json(Collections.singletonList(facility)), h.client.getFacilities());
            assertEquals("/facilities/v2/", h.call(0).path);
        }

        @Test
        void getAllotment() {
            Harness h = make(ok(Collections.singletonList(
                map("FacilityId", 1234, "FacilityLicenseNumber", LICENSE, "Allotment", 5000))));
            List<Allotment> allotments = h.client.getAllotment(LICENSE);
            assertEquals(1, allotments.size());
            Allotment allotment = allotments.get(0);
            assertEquals(1234, allotment.getFacilityId());
            assertEquals(LICENSE, allotment.getFacilityLicenseNumber());
            assertEquals(5000, allotment.getAllotment());
            assertEquals("GET", h.call(0).method);
            assertEquals("/retailid/v2/allotment", h.call(0).path);
            assertEquals(map("licenseNumber", LICENSE), h.call(0).query);
        }

        @Test
        void generate() {
            Harness h = make(ok(map("IssuanceId", "661d835f5f6fac1d7ee1f347")));
            GenerateResult result = h.client.generate(LICENSE, LABEL, 3);
            assertEquals("661d835f5f6fac1d7ee1f347", result.getIssuanceId());
            FakeTransport.Call call = h.call(0);
            assertEquals("POST", call.method);
            assertEquals("/retailid/v2/generate", call.path);
            assertEquals(map("licenseNumber", LICENSE), call.query);
            assertEquals(json(map("PackageLabel", LABEL, "Quantity", 3)), call.json);
            assertEquals("application/json", call.headers.get("Content-Type"));
        }

        @Test
        void generateRejectsBadQuantity() {
            Harness h = make();
            assertThrows(IllegalArgumentException.class, () -> h.client.generate(LICENSE, LABEL, 0));
        }

        @Test
        void packagesInfo() {
            Harness h = make(ok(Collections.singletonList(map(
                "PackageLabel", LABEL,
                "QrCount", 3,
                "HasQrs", true,
                "Issuances", Collections.singletonList(
                    map("LabelSet", 1, "LabelQuantity", 3, "CreatedAt", "2026-10-21T00:00:00Z")),
                "SiblingCount", 0,
                "RequiresVerification", false,
                "EstimatedBalance", 3))));
            List<PackageInfo> infos = h.client.getPackagesInfo(LICENSE, Collections.singletonList(LABEL));
            assertEquals(1, infos.size());
            PackageInfo info = infos.get(0);
            assertEquals(LABEL, info.getPackageLabel());
            assertEquals(3, info.getQrCount());
            assertTrue(info.hasQrs());
            assertEquals(1, info.getIssuances().get(0).getLabelSet());
            assertEquals(3, info.getIssuances().get(0).getLabelQuantity());
            assertEquals("2026-10-21T00:00:00Z", info.getIssuances().get(0).getCreatedAt());
            assertEquals(0, info.getSiblingCount());
            assertFalse(info.requiresVerification());
            assertEquals(3, info.getEstimatedBalance());
            assertEquals(json(map("packageLabels", Collections.singletonList(LABEL))), h.call(0).json);
        }

        @Test
        void packageInfoSingleAndDataWrapper() {
            Harness h = make(ok(map("Data", Collections.singletonList(map("Label", LABEL, "QrCount", 2)))),
                ok(Collections.emptyList()));
            PackageInfo info = h.client.getPackageInfo(LICENSE, LABEL).orElseThrow();
            assertEquals(LABEL, info.getPackageLabel());
            assertEquals(2, info.getQrCount());
            assertTrue(h.client.getPackageInfo(LICENSE, LABEL).isEmpty());
        }

        @Test
        void packagesInfoChunksByTen() {
            List<String> labels = new ArrayList<>();
            for (int i = 0; i < 23; i++) {
                labels.add(String.format("1A40603000077770000000%02d", i));
            }
            Harness h = make(ok(Collections.emptyList()), ok(Collections.emptyList()), ok(Collections.emptyList()));
            h.client.getPackagesInfo(LICENSE, labels);
            List<Integer> sizes = new ArrayList<>();
            for (FakeTransport.Call call : h.transport.calls) {
                sizes.add(((List<?>) ((Map<?, ?>) call.json).get("packageLabels")).size());
            }
            assertEquals(Arrays.asList(10, 10, 3), sizes);
        }

        @Test
        void packagesInfoRetriesServerError() {
            Harness h = make(ok(map("Message", "boom"), 503), ok(Collections.emptyList()));
            assertTrue(h.client.getPackagesInfo(LICENSE, Collections.singletonList(LABEL)).isEmpty());
            assertEquals(2, h.transport.calls.size());
            assertEquals(1, h.sleeps.size());
        }

        @Test
        void availableTagsAndPackage() {
            Harness h = make(ok(map("Data", Collections.singletonList(map("Label", LABEL)))), ok(map("Id", 1)));
            assertEquals(json(Collections.singletonList(map("Label", LABEL))), h.client.getAvailableTags(LICENSE));
            assertEquals(json(map("Id", 1)), h.client.getPackage(LICENSE, LABEL));
            assertEquals("/tags/v2/package/available", h.call(0).path);
            assertEquals("/packages/v2/" + LABEL, h.call(1).path);
        }

        @Test
        void pathSegmentsAreEscaped() {
            Harness h = make(ok(map("Id", 1)));
            h.client.getPackage(LICENSE, "a/b c");
            assertEquals("/packages/v2/a%2Fb%20c", h.call(0).path);
        }
    }

    @Nested
    class Receiving {
        final Map<String, Object> receiveBody = map(
            "Eaches", Arrays.asList(QR_A, QR_B, QR_C),
            "SiblingTags", Collections.singletonList(LABEL),
            "RequiresVerification", false,
            "QrCount", 3,
            "SomeNewField", "ignored");

        @Test
        void receive() {
            Harness h = make(ok(receiveBody));
            ReceiveResult result = h.client.receive(LICENSE, LABEL);
            assertEquals(Arrays.asList(QR_A, QR_B, QR_C), result.getEaches());
            assertEquals(Collections.singletonList(LABEL), result.getSiblingTags());
            assertFalse(result.requiresVerification());
            assertEquals(3, result.getQrCount());
            assertEquals("ignored", result.getRaw().get("SomeNewField"));
            assertEquals("/retailid/v2/receive/" + LABEL, h.call(0).path);
        }

        @ParameterizedTest
        @ValueSource(strings = {QR_A, "ZScU6dsbUk98nsJEAA"})
        void receiveByQrSendsShortCode(String value) {
            Harness h = make(ok(receiveBody));
            h.client.receiveByQr(LICENSE, value);
            assertEquals("/retailid/v2/receive/qr/ZScU6dsbUk98nsJEAA", h.call(0).path);
        }

        @Test
        void shortCodeFromUrl() {
            assertEquals("ZScU6dsbUk98nsJEAA", RetailIdClient.shortCodeFromUrl(QR_A));
            assertEquals("10NOIEYKAJDG6CF0EXGJL",
                RetailIdClient.shortCodeFromUrl("HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL"));
            assertEquals("ZScU6dsbUk98nsJEAA", RetailIdClient.shortCodeFromUrl("ZScU6dsbUk98nsJEAA"));
            assertEquals("ZScU6dsbUk98nsJEAA",
                RetailIdClient.shortCodeFromUrl(" https://1a4.com/ZScU6dsbUk98nsJEAA/?x=1#y "));
            assertThrows(IllegalArgumentException.class, () -> RetailIdClient.shortCodeFromUrl("https://1a4.com/"));
            assertThrows(IllegalArgumentException.class, () -> RetailIdClient.shortCodeFromUrl("https://1a4.com"));
        }

        @Test
        void associate() {
            Harness h = make(ok(map("Added", 2)));
            h.client.associate(LICENSE, Collections.singletonList(new Association(LABEL, Arrays.asList(QR_A, QR_B))));
            FakeTransport.Call call = h.call(0);
            assertEquals("POST", call.method);
            assertEquals("/retailid/v2/associate", call.path);
            assertEquals(json(Collections.singletonList(map("PackageLabel", LABEL, "QrUrls", Arrays.asList(QR_A, QR_B)))),
                call.json);
        }

        @Test
        void associatePackageAndMapInput() {
            Harness h = make(ok(null), ok(null));
            assertNull(h.client.associatePackage(LICENSE, LABEL, Collections.singletonList(QR_A)));
            h.client.associate(LICENSE, Collections.singletonList(
                map("PackageLabel", LABEL, "QrUrls", Collections.singletonList(QR_A))));
            assertEquals(h.call(0).json, h.call(1).json);
        }

        @Test
        void associateLimitsBatchSize() {
            Harness h = make();
            Association one = new Association(LABEL, Collections.singletonList(QR_A));
            IllegalArgumentException tooMany = assertThrows(IllegalArgumentException.class,
                () -> h.client.associate(LICENSE, Collections.nCopies(11, one)));
            assertTrue(tooMany.getMessage().contains("no more than 10"));
            assertThrows(IllegalArgumentException.class, () -> h.client.associate(LICENSE, Collections.emptyList()));
            assertThrows(IllegalArgumentException.class,
                () -> h.client.associate(LICENSE, Collections.singletonList("not an association")));
            assertTrue(h.transport.calls.isEmpty());
        }

        @Test
        void mergeSendsTargetFirst() {
            Harness h = make(ok(map("Ids", Collections.singletonList(1), "Warnings", null)));
            assertEquals(json(map("Ids", Collections.singletonList(1), "Warnings", null)),
                h.client.merge(LICENSE, LABEL, SOURCE_LABEL));
            assertEquals("/retailid/v2/merge", h.call(0).path);
            assertEquals(json(map("packageLabels", Arrays.asList(LABEL, SOURCE_LABEL))), h.call(0).json);
        }

        @Test
        void mergeRejectsSameLabel() {
            Harness h = make();
            assertThrows(IllegalArgumentException.class, () -> h.client.merge(LICENSE, LABEL, LABEL));
        }

        @Test
        void mergeRejectionIsNotRetried() {
            Harness h = make(ok(map("Message", "Lab results differ"), 422));
            UnprocessableException e = assertThrows(UnprocessableException.class,
                () -> h.client.merge(LICENSE, LABEL, SOURCE_LABEL));
            assertEquals("Lab results differ", e.getApiMessage());
            assertEquals(1, h.transport.calls.size());
        }
    }

    @Nested
    class Sales {
        final Map<String, Object> receipt = map(
            "SalesDateTime", "2026-10-28T12:00:00",
            "Transactions", Collections.singletonList(
                map("PackageLabel", LABEL, "QrCodes", Arrays.asList(QR_A, QR_B))));

        @Test
        void postSalesReceipts() {
            Harness h = make(ok(map("Ids", Collections.singletonList(42), "Warnings", null)));
            assertEquals(json(map("Ids", Collections.singletonList(42), "Warnings", null)),
                h.client.postSalesReceipts(LICENSE, Collections.singletonList(receipt)));
            assertEquals("/sales/v2/receipts", h.call(0).path);
            assertEquals(json(Collections.singletonList(receipt)), h.call(0).json);
        }

        @ParameterizedTest
        @CsvSource({
            "deliveries, /sales/v2/deliveries",
            "deliveries_retailer, /sales/v2/deliveries/retailer",
            "deliveries_retailer_sale, /sales/v2/deliveries/retailer/sale",
        })
        void postSalesDeliveryEndpoints(String endpoint, String path) {
            Harness h = make(ok(map("Ids", Collections.singletonList(1))));
            h.client.postSales(LICENSE, Collections.singletonList(receipt), endpoint);
            assertEquals(path, h.call(0).path);
        }

        @Test
        void unknownSalesEndpoint() {
            Harness h = make();
            assertThrows(IllegalArgumentException.class,
                () -> h.client.postSales(LICENSE, Collections.singletonList(receipt), "nope"));
        }
    }

    @Nested
    class Catalog {
        @Test
        void iterGlobalProductsFollowsPages() {
            Harness h = make(
                ok(map("Data", Arrays.asList(map("Id", 1), map("Id", 2)), "TotalPages", 2, "PageNumber", 1)),
                ok(map("Data", Collections.singletonList(map("Id", 3)), "TotalPages", 2, "PageNumber", 2)));
            List<Object> products = h.client.getGlobalProducts(77, 2);
            List<Object> ids = new ArrayList<>();
            for (Object p : products) {
                ids.add(((Map<?, ?>) p).get("Id"));
            }
            assertEquals(Arrays.asList(1L, 2L, 3L), ids);
            assertEquals(map("brandId", "77", "pageNumber", "1", "pageSize", "2"), h.call(0).query);
            assertEquals("2", h.call(1).query.get("pageNumber"));
            assertFalse(h.call(0).query.containsKey("licenseNumber"));
        }

        @Test
        void iteratorIsLazy() {
            Harness h = make(
                ok(map("Data", Collections.singletonList(map("Id", 1)), "TotalPages", 2)),
                ok(map("Data", Collections.singletonList(map("Id", 2)), "TotalPages", 2)));
            Iterator<Object> it = h.client.iterGlobalProducts(77);
            assertTrue(h.transport.calls.isEmpty());
            it.next();
            assertEquals(1, h.transport.calls.size());
            it.next();
            assertFalse(it.hasNext());
            assertEquals(2, h.transport.calls.size());
        }

        @Test
        void unpagedListResponse() {
            Harness h = make(ok(Arrays.asList(map("Id", 1), map("Id", 2))));
            assertEquals(2, h.client.getGlobalProducts(77).size());
            assertEquals(1, h.transport.calls.size());
        }

        @Test
        void getGlobalProduct() {
            Harness h = make(ok(map("Id", 5, "DisplayName", "Gummies")));
            assertEquals("Gummies", ((Map<?, ?>) h.client.getGlobalProduct(5)).get("DisplayName"));
            assertEquals("/globalproducts/v2/5", h.call(0).path);
        }
    }

    @Nested
    class ErrorsAndRetries {
        @Test
        void statusMapsToErrorClass() {
            Harness h = make(ok(map("Message", "bad keys"), 401));
            AuthenticationException e = assertThrows(AuthenticationException.class, () -> h.client.getFacilities());
            assertEquals(401, e.getStatusCode());
            assertEquals("GET", e.getMethod());
            assertEquals("/facilities/v2/", e.getPath());
            assertFalse(e.getMessage().contains("vendor-key"));
        }

        @Test
        void notFound() {
            Harness h = make(ok(Collections.singletonList(map("message", "Package not found")), 404));
            NotFoundException e = assertThrows(NotFoundException.class, () -> h.client.receive(LICENSE, LABEL));
            assertTrue(e.getMessage().contains("Package not found"));
        }

        @Test
        void rateLimitWaitsRetryAfter() {
            Harness h = make(ok(null, 429, map("Retry-After", "7")), ok(map("IssuanceId", "abc")));
            assertEquals("abc", h.client.generate(LICENSE, LABEL, 1).getIssuanceId());
            assertEquals(Collections.singletonList(Duration.ofSeconds(7)), h.sleeps);
            assertEquals(2, h.transport.calls.size());
        }

        @Test
        void rateLimitWithoutHeaderBacksOffIncreasingly() {
            Harness h = new Harness(md().backoffBase(Duration.ofSeconds(1)),
                ok(null, 429), ok(null, 429), ok(Collections.emptyList()));
            h.client.getFacilities();
            assertEquals(2, h.sleeps.size());
            double first = seconds(h.sleeps.get(0));
            double second = seconds(h.sleeps.get(1));
            assertTrue(first >= 1.0 && first < 1.5, "first delay " + first);
            assertTrue(second >= 2.0 && second < 2.5, "second delay " + second);
        }

        @Test
        void rateLimitGivesUpAfterMaxRetries() {
            Harness h = new Harness(md().maxRetries(2), ok(null, 429), ok(null, 429), ok(null, 429));
            assertThrows(RateLimitException.class, () -> h.client.getFacilities());
            assertEquals(3, h.transport.calls.size());
        }

        @Test
        void getRetriesServerError() {
            Harness h = make(ok(null, 502), ok(map("Eaches", Collections.emptyList())));
            h.client.receive(LICENSE, LABEL);
            assertEquals(2, h.transport.calls.size());
        }

        @Test
        void writeDoesNotRetryServerError() {
            Harness h = make(ok(null, 500));
            assertThrows(ServerException.class, () -> h.client.generate(LICENSE, LABEL, 1));
            assertEquals(1, h.transport.calls.size());
        }

        @Test
        void writeTimeoutIsNotRetried() {
            Harness h = make(new HttpTimeoutException("timed out"));
            RetailIdTimeoutException e = assertThrows(RetailIdTimeoutException.class,
                () -> h.client.generate(LICENSE, LABEL, 1));
            assertEquals("POST", e.getMethod());
            assertEquals("/retailid/v2/generate", e.getPath());
            assertEquals(1, h.transport.calls.size());
        }

        @Test
        void readTimeoutIsRetried() {
            Harness h = make(new HttpConnectTimeoutException("timed out"),
                ok(map("Eaches", Collections.singletonList(QR_A))));
            assertEquals(Collections.singletonList(QR_A), h.client.receive(LICENSE, LABEL).getEaches());
            assertEquals(2, h.transport.calls.size());
        }

        @Test
        void otherNetworkErrorsAreUnchecked() {
            Harness h = make(new IOException("connection reset"));
            assertThrows(java.io.UncheckedIOException.class, () -> h.client.getFacilities());
            assertEquals(1, h.transport.calls.size());
        }

        @Test
        void nonJsonBodyIsReturnedAsText() {
            Harness h = make(new HttpTransport.Response(400, Collections.emptyMap(),
                "plain failure".getBytes(StandardCharsets.UTF_8)));
            BadRequestException e = assertThrows(BadRequestException.class, () -> h.client.getFacilities());
            assertEquals("plain failure", e.getApiMessage());
            assertEquals("plain failure", e.getBody());
        }

        @Test
        void forStatusMapsStatus() {
            RetailIdApiException err = RetailIdApiException.forStatus(403, map("Message", "no access"), null, "GET", "/x");
            assertInstanceOf(PermissionDeniedException.class, err);
            assertEquals("no access", err.getApiMessage());
            assertEquals("403 GET /x: no access", err.getMessage());
            assertInstanceOf(ServerException.class, RetailIdApiException.forStatus(503, null, null));
            assertEquals(RetailIdApiException.class, RetailIdApiException.forStatus(418, "teapot", null).getClass());
            assertEquals("Request failed", RetailIdApiException.forStatus(400, null, null).getApiMessage());
            RetailIdApiException limited = RetailIdApiException.forStatus(429, null, "3");
            assertInstanceOf(RateLimitException.class, limited);
            assertEquals(Duration.ofSeconds(3), ((RateLimitException) limited).getRetryAfter());
            assertNull(((RateLimitException) RetailIdApiException.forStatus(429, null, "soon")).getRetryAfter());
        }

        @Test
        void retryAfterHeaderIsCaseInsensitive() {
            Harness h = make(ok(null, 429, map("retry-after", "2")), ok(Collections.emptyList()));
            h.client.getFacilities();
            assertEquals(Collections.singletonList(Duration.ofSeconds(2)), h.sleeps);
        }
    }

    @Nested
    class DefaultTransport {
        @Test
        @DisplayName("JdkHttpTransport sends auth, query and JSON body over real HTTP")
        void endToEnd() throws IOException {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            AtomicReference<String> seen = new AtomicReference<>();
            server.createContext("/", exchange -> {
                String body;
                try (InputStream in = exchange.getRequestBody()) {
                    body = new String(in.readAllBytes(), StandardCharsets.UTF_8);
                }
                seen.set(exchange.getRequestMethod() + " " + exchange.getRequestURI() + " "
                    + exchange.getRequestHeaders().getFirst("Authorization") + " "
                    + exchange.getRequestHeaders().getFirst("Content-Type") + " " + body);
                byte[] reply = "{\"IssuanceId\":\"xyz\"}".getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, reply.length);
                try (OutputStream out = exchange.getResponseBody()) {
                    out.write(reply);
                }
            });
            server.start();
            try (RetailIdClient client = RetailIdClient.builder("vendor-key", "user-key")
                    .baseUrl("http://127.0.0.1:" + server.getAddress().getPort())
                    .timeout(Duration.ofSeconds(5)).build()) {
                assertEquals("xyz", client.generate(LICENSE, LABEL, 2).getIssuanceId());
            } finally {
                server.stop(0);
            }
            String auth = "Basic " + Base64.getEncoder()
                .encodeToString("vendor-key:user-key".getBytes(StandardCharsets.UTF_8));
            assertEquals("POST /retailid/v2/generate?licenseNumber=837-XYZ " + auth
                + " application/json {\"PackageLabel\":\"" + LABEL + "\",\"Quantity\":2}", seen.get());
        }
    }
}
