// Copyright 2025 Metrc, LLC
// SPDX-License-Identifier: MIT
//
// Client for the Metrc Retail ID API — the TypeScript port of
// python/src/retailid/api.py (behavioural reference) and
// java/src/main/java/com/retailid/api/RetailIdClient.java.
//
// Retry policy (identical to Python/Java):
//   * 429 is always retried (honouring a numeric Retry-After) — the request was
//     rejected, not applied, so this is safe even for writes;
//   * 5xx responses and timeouts are retried only for idempotent calls
//     (GET, and POST /retailid/v2/packages/info);
//   * network failures are never retried;
//   * writes (generate, associate, merge, sales) are never retried after a
//     timeout or server error, because they may already have been applied.

import {
  DEFAULT_BACKOFF_BASE_MS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
  MAX_RECORDS_PER_REQUEST,
  MAX_TIMER_MS,
  SALES_ENDPOINTS,
} from './constants.js';
import type { SalesEndpoint } from './constants.js';
import type { RetailIdConfig } from './config.js';
import {
  RateLimitError,
  RetailIdNetworkError,
  RetailIdResponseError,
  RetailIdTimeoutError,
  errorForStatus,
} from './errors.js';
import { describeType, hasOwn, isJsonObject } from './json.js';
import type { JsonObject, JsonValue } from './json.js';
import { Allotment, Association, GenerateResult, PackageInfo, ReceiveResult } from './models.js';
import type { AssociationWire } from './models.js';
import { buildQuery, encodePathSegment, shortCodeFromUrl } from './url.js';
import type { QueryValue } from './url.js';
import {
  optionalSignal,
  optionsObject,
  requireBatch,
  requireIdOrLabel,
  requireInteger,
  requireJsonObject,
  requireString,
} from './validate.js';

/** The `fetch` signature the client needs. Defaults to the global `fetch`. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Waits `ms` milliseconds; should reject with `signal.reason` if `signal` aborts. */
export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

/** Optional diagnostics sink. Receives method, path, license number, status and timing — never credentials. */
export interface RetailIdLogger {
  debug?(message: string): void;
  info?(message: string): void;
  warn?(message: string): void;
}

/** HTTP methods accepted by {@link RetailIdClient.request}. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/** Options for {@link RetailIdClient}. Durations are in milliseconds. */
export interface RetailIdClientOptions {
  /** Vendor (software) API key — the Basic auth username. */
  vendorApiKey: string;
  /** API key of the Metrc user making requests — the Basic auth password. */
  userApiKey: string;
  /** Two-letter market code, e.g. `"md"` -> `https://api-md.metrc.com`. */
  stateCode?: string;
  /** Full base URL; overrides `stateCode` (use for the Sandbox). http(s) only, no credentials/query/fragment. */
  baseUrl?: string;
  /** Per-attempt timeout, including reading the body. Default 30 000. */
  timeoutMs?: number;
  /** Maximum retries for retryable failures. Default 3. */
  maxRetries?: number;
  /** Base delay for exponential backoff when no Retry-After is sent. Default 1 000. */
  backoffBaseMs?: number;
  /** Custom `fetch` (proxies, instrumentation, tests). Default: global `fetch`. */
  fetch?: FetchLike;
  /** Custom sleep between retries (tests). Default: an abortable timer. */
  sleep?: Sleep;
  /** Optional logger. Default: silent. */
  logger?: RetailIdLogger;
}

/** Per-call options accepted by every endpoint method. */
export interface CallOptions {
  /** Cancels the call (including any backoff wait). The call rejects with `signal.reason`. */
  signal?: AbortSignal;
}

/** Options for {@link RetailIdClient.request}. */
export interface RequestOptions extends CallOptions {
  /** Sent as the `licenseNumber` query parameter. */
  licenseNumber?: string;
  /** Extra query parameters; `null`/`undefined` values are omitted. */
  params?: Readonly<Record<string, QueryValue>>;
  /** JSON request body. `undefined`/`null` send no body. */
  body?: JsonValue;
  /** Marks the call read-only so timeouts and 5xx are retried. Default: `method === 'GET'`. */
  idempotent?: boolean;
}

/** Options for {@link RetailIdClient.postSales}. */
export interface PostSalesOptions extends CallOptions {
  /** One of {@link SALES_ENDPOINTS}. Default `"receipts"`. */
  endpoint?: SalesEndpoint;
}

/** Options for the global-product listing methods. */
export interface GlobalProductsOptions extends CallOptions {
  /** Page size to request; omitted means the server default. */
  pageSize?: number;
}

const HTTP_METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
const STATE_CODE = /^[A-Za-z]{2}$/;
const inspectSymbol = Symbol.for('nodejs.util.inspect.custom');

/** Default sleep: a timer that rejects with the signal's reason if aborted. */
const defaultSleep: Sleep = (ms, signal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/** UTF-8 safe Base64 (btoa alone rejects non-Latin-1 input). */
function base64Utf8(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RangeError('baseUrl must be an absolute http(s) URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new RangeError('baseUrl must use http or https');
  if (url.username !== '' || url.password !== '') throw new RangeError('baseUrl must not contain credentials');
  if (url.search !== '' || url.hash !== '') throw new RangeError('baseUrl must not contain a query string or fragment');
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

const isTimeoutError = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'TimeoutError' || (error as { code?: unknown }).code === 23);

/**
 * Client for the Metrc Retail ID API.
 *
 * ```ts
 * import { RetailIdClient } from '@metrc/retailid/api';
 *
 * const client = new RetailIdClient({ vendorApiKey, userApiKey, stateCode: 'md' });
 * const issuance = await client.generate('837-XYZ', '1A4060300007777000000001', 3);
 * const received = await client.receive('837-XYZ', '1A4060300007777000000001');
 * for (const url of received.eaches) printLabel(url);
 * ```
 *
 * Server-side only: the client refuses to run in a browser, because it carries
 * API keys. Instances are immutable and safe to share across concurrent calls.
 */
export class RetailIdClient {
  readonly #authorization: string;
  readonly #fetch: FetchLike;
  readonly #sleep: Sleep;
  readonly #logger: RetailIdLogger | undefined;
  /** Base URL requests are sent to, without a trailing slash. */
  readonly baseUrl: string;
  /** Per-attempt timeout in milliseconds. */
  readonly timeoutMs: number;
  /** Maximum retries for retryable failures. */
  readonly maxRetries: number;
  /** Base backoff delay in milliseconds. */
  readonly backoffBaseMs: number;

  /**
   * @throws TypeError for wrongly-typed options, RangeError for invalid values,
   *   Error when run in a browser or without a global `fetch`.
   */
  constructor(options: RetailIdClientOptions) {
    if (typeof options !== 'object' || options === null || Array.isArray(options)) {
      throw new TypeError(`options must be an object, got ${describeType(options)}`);
    }
    const g = globalThis as { window?: unknown; document?: unknown };
    if (typeof g.window !== 'undefined' && typeof g.document !== 'undefined') {
      throw new Error(
        'RetailIdClient is server-side only: it carries Metrc API keys, which must never be shipped to a browser.',
      );
    }
    const vendorApiKey = requireString('vendorApiKey', options.vendorApiKey);
    const userApiKey = requireString('userApiKey', options.userApiKey);
    if (vendorApiKey.includes(':')) throw new RangeError('vendorApiKey must not contain ":" (HTTP Basic username)');

    if (options.baseUrl !== undefined) {
      this.baseUrl = normalizeBaseUrl(requireString('baseUrl', options.baseUrl));
    } else if (options.stateCode !== undefined) {
      const stateCode = requireString('stateCode', options.stateCode).trim();
      if (!STATE_CODE.test(stateCode)) throw new RangeError('stateCode must be a two-letter market code, e.g. "md"');
      this.baseUrl = `https://api-${stateCode.toLowerCase()}.metrc.com`;
    } else {
      throw new RangeError('Provide either stateCode or baseUrl');
    }

    this.timeoutMs =
      options.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : requireInteger('timeoutMs', options.timeoutMs, 1, MAX_TIMER_MS);
    this.maxRetries =
      options.maxRetries === undefined ? DEFAULT_MAX_RETRIES : requireInteger('maxRetries', options.maxRetries, 0);
    this.backoffBaseMs =
      options.backoffBaseMs === undefined
        ? DEFAULT_BACKOFF_BASE_MS
        : requireInteger('backoffBaseMs', options.backoffBaseMs, 0, MAX_TIMER_MS);

    if (options.fetch !== undefined && typeof options.fetch !== 'function') {
      throw new TypeError(`fetch must be a function, got ${describeType(options.fetch)}`);
    }
    if (options.fetch === undefined && typeof globalThis.fetch !== 'function') {
      throw new Error('No global fetch is available; use Node.js 22+ or pass the fetch option.');
    }
    if (options.sleep !== undefined && typeof options.sleep !== 'function') {
      throw new TypeError(`sleep must be a function, got ${describeType(options.sleep)}`);
    }
    if (options.logger !== undefined && (typeof options.logger !== 'object' || options.logger === null)) {
      throw new TypeError(`logger must be an object, got ${describeType(options.logger)}`);
    }
    this.#fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.#sleep = options.sleep ?? defaultSleep;
    this.#logger = options.logger;
    this.#authorization = `Basic ${base64Utf8(`${vendorApiKey}:${userApiKey}`)}`;
    // Immutable at runtime; subclasses are left extensible so they can add fields.
    if (new.target === RetailIdClient) Object.freeze(this);
  }

  /**
   * Builds a client from a {@link RetailIdConfig}. `overrides` (milliseconds)
   * take precedence over the config's values (Python `from_config(**kwargs)`).
   */
  static fromConfig(config: RetailIdConfig, overrides: Partial<RetailIdClientOptions> = {}): RetailIdClient {
    if (typeof config !== 'object' || config === null || typeof config.toClientOptions !== 'function') {
      throw new TypeError('config must be a RetailIdConfig');
    }
    const options: RetailIdClientOptions = { ...config.toClientOptions() };
    for (const [key, value] of Object.entries(optionsObject('overrides', overrides))) {
      if (value !== undefined) (options as unknown as Record<string, unknown>)[key] = value;
    }
    return new RetailIdClient(options);
  }

  /** Safe description (no keys). */
  toString(): string {
    return `RetailIdClient(baseUrl=${this.baseUrl})`;
  }

  /** Safe JSON form (no keys). */
  toJSON(): Record<string, unknown> {
    return { baseUrl: this.baseUrl, timeoutMs: this.timeoutMs, maxRetries: this.maxRetries, backoffBaseMs: this.backoffBaseMs };
  }

  /** Safe Node.js `util.inspect` form (no keys). */
  [inspectSymbol](): string {
    return this.toString();
  }

  // -- low-level --------------------------------------------------------------

  /**
   * Sends a request and returns the decoded body: parsed JSON, the raw text
   * if it is not JSON, or `null` if empty.
   *
   * @throws RetailIdApiError (subclass by status) for non-2xx responses.
   * @throws RetailIdTimeoutError if an attempt exceeds `timeoutMs` and no retry remains.
   * @throws RetailIdNetworkError for transport failures (never retried).
   * @throws `signal.reason` if the caller aborts.
   */
  async request(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<JsonValue> {
    const opts = optionsObject('options', options) as RequestOptions;
    const verb = requireString('method', method).toUpperCase() as HttpMethod;
    if (!HTTP_METHODS.includes(verb)) throw new RangeError(`Unsupported HTTP method '${method}'`);
    if (typeof path !== 'string' || !path.startsWith('/')) throw new RangeError("path must be a string starting with '/'");
    const licenseNumber =
      opts.licenseNumber === undefined ? undefined : requireString('licenseNumber', opts.licenseNumber);
    const userSignal = optionalSignal('signal', opts.signal);
    if (opts.idempotent !== undefined && typeof opts.idempotent !== 'boolean') {
      throw new TypeError('idempotent must be a boolean');
    }
    const idempotent = opts.idempotent ?? verb === 'GET';
    const url = this.baseUrl + path + buildQuery(licenseNumber, opts.params);
    const body = opts.body === undefined || opts.body === null ? undefined : JSON.stringify(opts.body);

    userSignal?.throwIfAborted();
    let attempt = 0;
    for (;;) {
      const started = performance.now();
      const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
      const signal = userSignal ? AbortSignal.any([userSignal, timeoutSignal]) : timeoutSignal;
      const headers: Record<string, string> = { Accept: 'application/json', Authorization: this.#authorization };
      if (body !== undefined) headers['Content-Type'] = 'application/json';

      let response: Response;
      let text: string;
      try {
        response = await this.#fetch(url, { method: verb, headers, signal, redirect: 'follow', ...(body !== undefined ? { body } : {}) });
        text = await response.text();
      } catch (error) {
        if (userSignal?.aborted) throw userSignal.reason;
        if (timeoutSignal.aborted || isTimeoutError(error)) {
          this.#logger?.warn?.(
            `${verb} ${path} license=${licenseNumber ?? '-'} timed out after ${seconds(started)}s`,
          );
          if (idempotent && attempt < this.maxRetries) {
            attempt += 1;
            await this.#pause(this.#backoff(attempt), userSignal);
            continue;
          }
          throw new RetailIdTimeoutError(verb, path, this.timeoutMs, error);
        }
        throw new RetailIdNetworkError(verb, path, error);
      }

      const status = response.status;
      this.#logger?.debug?.(`${verb} ${path} license=${licenseNumber ?? '-'} -> ${status} in ${seconds(started)}s`);
      const decoded = decode(text);
      if (status >= 200 && status < 300) return decoded;

      const error = errorForStatus(status, decoded, response.headers, { method: verb, path });
      const retryable = status === 429 || (status >= 500 && idempotent);
      if (retryable && attempt < this.maxRetries) {
        attempt += 1;
        const delay = error instanceof RateLimitError && error.retryAfterMs !== null ? error.retryAfterMs : this.#backoff(attempt);
        this.#logger?.info?.(`${verb} ${path} -> ${status}, retrying in ${delay} ms (attempt ${attempt}/${this.maxRetries})`);
        await this.#pause(delay, userSignal);
        continue;
      }
      throw error;
    }
  }

  /** "wait a little longer after each attempt": base × 2^(n−1) + [0, 250) ms jitter (Python/Java formula). */
  #backoff(attempt: number): number {
    return Math.round(this.backoffBaseMs * 2 ** (attempt - 1) + Math.random() * 250);
  }

  async #pause(ms: number, signal: AbortSignal | undefined): Promise<void> {
    await this.#sleep(ms, signal);
    signal?.throwIfAborted();
  }

  /** Runs `parse` on a 2xx body; re-throws shape errors with request context. */
  async #typed<T>(
    method: HttpMethod,
    path: string,
    options: RequestOptions,
    parse: (data: JsonValue) => T,
  ): Promise<T> {
    const data = await this.request(method, path, options);
    try {
      return parse(data);
    } catch (error) {
      if (error instanceof RetailIdResponseError) {
        throw new RetailIdResponseError(`${method} ${path}: ${error.message}`, {
          method,
          path,
          statusCode: 200,
          field: error.field,
          body: data,
          cause: error,
        });
      }
      throw error;
    }
  }

  // -- access check (section 2) -------------------------------------------------

  /** `GET /facilities/v2/` — confirms the keys work and lists visible facilities. */
  async getFacilities(options?: CallOptions): Promise<JsonValue[]> {
    return this.#typed('GET', '/facilities/v2/', callOptions(options), (data) => dataList(data, 'facilities'));
  }

  // -- label printing (section 4) ----------------------------------------------

  /** `GET /retailid/v2/allotment` — remaining Retail Item IDs (New York only). */
  async getAllotment(licenseNumber: string, options?: CallOptions): Promise<Allotment[]> {
    const ln = requireString('licenseNumber', licenseNumber);
    return this.#typed('GET', '/retailid/v2/allotment', { ...callOptions(options), licenseNumber: ln }, (data) => {
      if (data === null) return [];
      const items = isJsonObject(data) ? [data] : data;
      if (!Array.isArray(items)) throw shapeError('allotment', 'an array or object', data);
      return items.map((item) => Allotment.fromJson(item));
    });
  }

  /**
   * `POST /retailid/v2/generate` — create Retail IDs for a package.
   *
   * Changes data; never retried after a timeout or server error. If this
   * throws {@link RetailIdTimeoutError}, call {@link getPackagesInfo} to check
   * whether the issuance was created before trying again.
   */
  async generate(
    licenseNumber: string,
    packageLabel: string,
    quantity: number,
    options?: CallOptions,
  ): Promise<GenerateResult> {
    const ln = requireString('licenseNumber', licenseNumber);
    const label = requireString('packageLabel', packageLabel);
    const qty = requireInteger('quantity', quantity, 1);
    return this.#typed(
      'POST',
      '/retailid/v2/generate',
      { ...callOptions(options), licenseNumber: ln, body: { PackageLabel: label, Quantity: qty } },
      (data) => GenerateResult.fromJson(data),
    );
  }

  /**
   * `POST /retailid/v2/packages/info` — Retail ID details for packages.
   * Read-only (retried like a GET). Labels are sent in batches of at most
   * {@link MAX_RECORDS_PER_REQUEST}; results are returned in batch order.
   */
  async getPackagesInfo(
    licenseNumber: string,
    packageLabels: string | readonly string[],
    options?: CallOptions,
  ): Promise<PackageInfo[]> {
    const ln = requireString('licenseNumber', licenseNumber);
    const labels = typeof packageLabels === 'string' ? [packageLabels] : packageLabels;
    if (!Array.isArray(labels)) throw new TypeError(`packageLabels must be a string or an array, got ${describeType(packageLabels)}`);
    if (labels.length === 0) throw new RangeError('packageLabels must not be empty');
    const checked = labels.map((label, index) => requireString(`packageLabels[${index}]`, label));
    const results: PackageInfo[] = [];
    for (let start = 0; start < checked.length; start += MAX_RECORDS_PER_REQUEST) {
      const chunk = checked.slice(start, start + MAX_RECORDS_PER_REQUEST);
      const infos = await this.#typed(
        'POST',
        '/retailid/v2/packages/info',
        { ...callOptions(options), licenseNumber: ln, body: { packageLabels: chunk }, idempotent: true },
        (data) => packageInfoList(data),
      );
      results.push(...infos);
    }
    return results;
  }

  /** Convenience wrapper around {@link getPackagesInfo} for one package; `undefined` if none returned. */
  async getPackageInfo(licenseNumber: string, packageLabel: string, options?: CallOptions): Promise<PackageInfo | undefined> {
    const label = requireString('packageLabel', packageLabel);
    const infos = await this.getPackagesInfo(licenseNumber, [label], options);
    return infos[0];
  }

  /** `GET /tags/v2/package/available` — unused tags for staging labels. */
  async getAvailableTags(licenseNumber: string, options?: CallOptions): Promise<JsonValue[]> {
    const ln = requireString('licenseNumber', licenseNumber);
    return this.#typed('GET', '/tags/v2/package/available', { ...callOptions(options), licenseNumber: ln }, (data) =>
      dataList(data, 'available tags'),
    );
  }

  /** `GET /packages/v2/{id}` or `/packages/v2/{label}` (includes `ProductLabel`). Returns the raw response. */
  async getPackage(licenseNumber: string, idOrLabel: string | number, options?: CallOptions): Promise<JsonValue> {
    const ln = requireString('licenseNumber', licenseNumber);
    const segment = encodePathSegment(requireIdOrLabel('idOrLabel', idOrLabel));
    return this.request('GET', `/packages/v2/${segment}`, { ...callOptions(options), licenseNumber: ln });
  }

  // -- receiving (sections 5-7) --------------------------------------------------

  /** `GET /retailid/v2/receive/{label}` — QR URLs and receiving status. */
  async receive(licenseNumber: string, packageLabel: string, options?: CallOptions): Promise<ReceiveResult> {
    const ln = requireString('licenseNumber', licenseNumber);
    const segment = encodePathSegment(requireString('packageLabel', packageLabel));
    return this.#typed('GET', `/retailid/v2/receive/${segment}`, { ...callOptions(options), licenseNumber: ln }, (data) =>
      ReceiveResult.fromJson(data),
    );
  }

  /**
   * `GET /retailid/v2/receive/qr/{shortCode}` — receive starting from one
   * scanned unit. Accepts the full scanned QR URL or the short code; only the
   * short code is sent.
   */
  async receiveByQr(licenseNumber: string, qrUrlOrShortCode: string, options?: CallOptions): Promise<ReceiveResult> {
    const ln = requireString('licenseNumber', licenseNumber);
    const code = encodePathSegment(shortCodeFromUrl(qrUrlOrShortCode));
    return this.#typed('GET', `/retailid/v2/receive/qr/${code}`, { ...callOptions(options), licenseNumber: ln }, (data) =>
      ReceiveResult.fromJson(data),
    );
  }

  /**
   * `POST /retailid/v2/associate` — Scan and Associate units with packages.
   *
   * Each entry is a package label and the full QR URLs (not short codes) of
   * the units physically in it; 1 to {@link MAX_RECORDS_PER_REQUEST} entries.
   * Changes data; never retried after a timeout or server error. Call
   * {@link receive} afterwards to confirm. Returns the raw response.
   */
  async associate(
    licenseNumber: string,
    associations: ReadonlyArray<Association | AssociationWire>,
    options?: CallOptions,
  ): Promise<JsonValue> {
    const ln = requireString('licenseNumber', licenseNumber);
    const entries = requireBatch<Association | AssociationWire>('associations', associations);
    const body = entries.map((entry) => Association.toJson(entry)) as unknown as JsonValue;
    return this.request('POST', '/retailid/v2/associate', { ...callOptions(options), licenseNumber: ln, body });
  }

  /** Convenience wrapper: associate `qrUrls` with one package. */
  async associatePackage(
    licenseNumber: string,
    packageLabel: string,
    qrUrls: readonly string[],
    options?: CallOptions,
  ): Promise<JsonValue> {
    return this.associate(licenseNumber, [{ packageLabel, qrUrls }], options);
  }

  /**
   * `POST /retailid/v2/merge` — Package Merge.
   *
   * The target (first) keeps and receives all Retail ID links; the source
   * gives its links up. A rejection (e.g. different original package, lab
   * results, or item) is raised as an API error and should not be resent
   * unchanged. Never retried after a timeout or server error. Returns the raw
   * response, typically `{ Ids: [...], Warnings: ... }`.
   */
  async merge(
    licenseNumber: string,
    targetPackageLabel: string,
    sourcePackageLabel: string,
    options?: CallOptions,
  ): Promise<JsonValue> {
    const ln = requireString('licenseNumber', licenseNumber);
    const target = requireString('targetPackageLabel', targetPackageLabel);
    const source = requireString('sourcePackageLabel', sourcePackageLabel);
    if (target === source) throw new RangeError('Target and source package labels must differ');
    return this.request('POST', '/retailid/v2/merge', {
      ...callOptions(options),
      licenseNumber: ln,
      body: { packageLabels: [target, source] },
    });
  }

  // -- point of sale (section 8) -------------------------------------------------

  /**
   * Reports sales that include Retail IDs. `records` are full sales objects
   * built from the market's Sales documentation; Retail IDs go in
   * `Transactions[].QrCodes` alongside `PackageLabel`. 1 to
   * {@link MAX_RECORDS_PER_REQUEST} records. Never retried after a timeout or
   * server error. Returns the raw response.
   */
  async postSales(licenseNumber: string, records: readonly JsonObject[], options?: PostSalesOptions): Promise<JsonValue> {
    const opts = optionsObject('options', options) as PostSalesOptions;
    const ln = requireString('licenseNumber', licenseNumber);
    const endpoint = opts.endpoint ?? 'receipts';
    if (typeof endpoint !== 'string' || !hasOwn(SALES_ENDPOINTS, endpoint)) {
      throw new RangeError(
        `Unknown sales endpoint '${String(endpoint)}'; expected one of ${Object.keys(SALES_ENDPOINTS).sort().join(', ')}`,
      );
    }
    const checked = requireBatch<JsonObject>('records', records).map((record, index) =>
      requireJsonObject(`records[${index}]`, record),
    );
    return this.request('POST', SALES_ENDPOINTS[endpoint], {
      ...callOptions(opts),
      licenseNumber: ln,
      body: checked.map((record) => ({ ...record })),
    });
  }

  /** `POST /sales/v2/receipts`. */
  async postSalesReceipts(licenseNumber: string, receipts: readonly JsonObject[], options?: CallOptions): Promise<JsonValue> {
    return this.postSales(licenseNumber, receipts, { ...callOptions(options), endpoint: 'receipts' });
  }

  // -- catalog (section 9) -------------------------------------------------------

  /**
   * `GET /globalproducts/v2?brandId=` — yields every Global Product across all
   * pages. Pages are requested lazily as iteration proceeds; breaking out of
   * the loop stops further requests.
   */
  async *iterGlobalProducts(brandId: string | number, options?: GlobalProductsOptions): AsyncGenerator<JsonValue, void, undefined> {
    const opts = optionsObject('options', options) as GlobalProductsOptions;
    const brand = requireIdOrLabel('brandId', brandId);
    const pageSize = opts.pageSize === undefined ? undefined : requireInteger('pageSize', opts.pageSize, 1);
    const call = callOptions(opts);
    for (let page = 1; ; page += 1) {
      const params: Record<string, QueryValue> = { brandId: brand, pageNumber: page, pageSize };
      const result = await this.#typed('GET', '/globalproducts/v2', { ...call, params }, (data) => globalProductsPage(data));
      yield* result.records;
      if (result.unpaged || result.records.length === 0 || result.totalPages === null || page >= result.totalPages) return;
    }
  }

  /** All Global Products for a brand (every page). */
  async getGlobalProducts(brandId: string | number, options?: GlobalProductsOptions): Promise<JsonValue[]> {
    const products: JsonValue[] = [];
    for await (const product of this.iterGlobalProducts(brandId, options)) products.push(product);
    return products;
  }

  /** `GET /globalproducts/v2/{id}` — one Global Product. Returns the raw response. */
  async getGlobalProduct(productId: string | number, options?: CallOptions): Promise<JsonValue> {
    const segment = encodePathSegment(requireIdOrLabel('productId', productId));
    return this.request('GET', `/globalproducts/v2/${segment}`, callOptions(options));
  }
}

// -- helpers -------------------------------------------------------------------

const seconds = (started: number): string => ((performance.now() - started) / 1000).toFixed(2);

/** Empty/whitespace -> null; JSON -> parsed; otherwise the raw text (Python `_decode`). */
function decode(text: string): JsonValue {
  if (text.trim() === '') return null;
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return text;
  }
}

function callOptions(options: unknown): CallOptions {
  const opts = optionsObject('options', options);
  const signal = optionalSignal('signal', opts['signal']);
  return signal === undefined ? {} : { signal };
}

function shapeError(what: string, expected: string, data: JsonValue): RetailIdResponseError {
  return new RetailIdResponseError(`${what}: expected ${expected}, got ${describeType(data)}`, { field: null });
}

/** A list, `{ Data: [...] }`, `{ Data: null }`, or `null`. An object without `Data` is malformed. */
function dataList(data: JsonValue, what: string): JsonValue[] {
  if (data === null) return [];
  if (Array.isArray(data)) return data;
  if (isJsonObject(data) && hasOwn(data, 'Data')) {
    const records = data['Data'];
    if (records === null || records === undefined) return [];
    if (Array.isArray(records)) return records;
  }
  throw shapeError(what, 'an array or { Data: [...] }', data);
}

/** Array, `{ Data: [...] }`, or a single bare object (Python behaviour). */
function packageInfoList(data: JsonValue): PackageInfo[] {
  if (data === null) return [];
  let items: JsonValue;
  if (isJsonObject(data)) items = hasOwn(data, 'Data') ? (data['Data'] ?? []) : [data];
  else items = data;
  if (!Array.isArray(items)) throw shapeError('packages/info', 'an array, object, or { Data: [...] }', data);
  return items.map((item) => PackageInfo.fromJson(item));
}

function globalProductsPage(data: JsonValue): { records: JsonValue[]; totalPages: number | null; unpaged: boolean } {
  if (data === null) return { records: [], totalPages: null, unpaged: true };
  if (Array.isArray(data)) return { records: data, totalPages: null, unpaged: true };
  if (!isJsonObject(data)) throw shapeError('globalproducts page', 'an array or { Data, TotalPages }', data);
  const records = data['Data'];
  if (records !== undefined && records !== null && !Array.isArray(records)) {
    throw shapeError('globalproducts Data', 'an array', records);
  }
  const total = data['TotalPages'];
  let totalPages: number | null = null;
  if (typeof total === 'number' && Number.isSafeInteger(total)) totalPages = total;
  else if (typeof total === 'string' && /^\d+$/.test(total)) totalPages = Number(total);
  else if (total !== undefined && total !== null) throw shapeError('globalproducts TotalPages', 'an integer', total);
  return { records: Array.isArray(records) ? records : [], totalPages, unpaged: false };
}
