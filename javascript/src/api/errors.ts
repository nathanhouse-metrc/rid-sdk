// Copyright 2025 Metrc, LLC
// SPDX-License-Identifier: MIT
//
// Errors raised by the Retail ID API client. Mirrors retailid.errors (Python)
// and com.retailid.api.*Exception (Java):
//
//   RetailIdError                      base class for every error this SDK raises
//   ├─ RetailIdApiError                non-2xx response (subclass chosen by status)
//   │   ├─ BadRequestError             400
//   │   ├─ AuthenticationError         401
//   │   ├─ PermissionDeniedError       403
//   │   ├─ NotFoundError               404
//   │   ├─ ConflictError               409
//   │   ├─ UnprocessableError          422
//   │   ├─ RateLimitError              429 (retryAfterMs)
//   │   └─ ServerError                 5xx
//   ├─ RetailIdTimeoutError            no reply within timeoutMs
//   ├─ RetailIdNetworkError            transport failure (DNS, refused, reset, ...)
//   ├─ RetailIdResponseError           2xx response whose body does not match the contract
//   └─ RetailIdConfigError             invalid or unreadable configuration
//
// Messages never contain API keys: they carry the method, the path (without
// the query string) and the API's own message text only.

import type { JsonValue } from './json.js';
import { isJsonObject } from './json.js';

/** Context attached to errors raised for a specific request. */
export interface RequestContext {
  /** HTTP method, e.g. `"POST"`. */
  readonly method?: string;
  /** Request path without the query string, e.g. `"/retailid/v2/generate"`. */
  readonly path?: string;
}

/** Base class for every error raised by this SDK. */
export class RetailIdError extends Error {
  override name = 'RetailIdError';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

const prefix = (status: number, method: string, path: string): string =>
  [String(status), method, path].filter((part) => part !== '').join(' ');

/**
 * The Retail ID API returned a non-success status code.
 *
 * `message` is formatted as `"<status> <METHOD> <path>: <apiMessage>"` (or
 * `"<status>: <apiMessage>"` without request context). `apiMessage` holds the
 * API's own text.
 */
export class RetailIdApiError extends RetailIdError {
  override name = 'RetailIdApiError';
  /** HTTP status code. */
  readonly statusCode: number;
  /** The API's error text (`Message`/`message` fields), or `"Request failed"`. */
  readonly apiMessage: string;
  /** HTTP method of the failed request, or `""`. */
  readonly method: string;
  /** Path of the failed request (no query string), or `""`. */
  readonly path: string;
  /** Decoded response body: parsed JSON, raw text, or `null` when empty. */
  readonly body: JsonValue;

  constructor(statusCode: number, apiMessage: string, details: RequestContext & { body?: JsonValue } = {}) {
    const method = details.method ?? '';
    const path = details.path ?? '';
    super(`${prefix(statusCode, method, path)}: ${apiMessage}`);
    this.statusCode = statusCode;
    this.apiMessage = apiMessage;
    this.method = method;
    this.path = path;
    this.body = details.body ?? null;
  }
}

/** 400: something in the request is missing or invalid. */
export class BadRequestError extends RetailIdApiError {
  override name = 'BadRequestError';
}

/** 401: the API keys were not accepted. */
export class AuthenticationError extends RetailIdApiError {
  override name = 'AuthenticationError';
}

/** 403: the keys work but lack Retail ID / Catalog permission or facility access. */
export class PermissionDeniedError extends RetailIdApiError {
  override name = 'PermissionDeniedError';
}

/** 404: the address, package, or code was not found. */
export class NotFoundError extends RetailIdApiError {
  override name = 'NotFoundError';
}

/** 409: the request conflicts with the current state. */
export class ConflictError extends RetailIdApiError {
  override name = 'ConflictError';
}

/** 422: a business rule blocked the request (e.g. a rejected Package Merge). */
export class UnprocessableError extends RetailIdApiError {
  override name = 'UnprocessableError';
}

/** 429: too many requests. */
export class RateLimitError extends RetailIdApiError {
  override name = 'RateLimitError';
  /** Delay requested by a numeric `Retry-After` header, in milliseconds; `null` if absent or not numeric. */
  readonly retryAfterMs: number | null;

  constructor(
    statusCode: number,
    apiMessage: string,
    details: RequestContext & { body?: JsonValue; retryAfterMs?: number | null } = {},
  ) {
    super(statusCode, apiMessage, details);
    this.retryAfterMs = details.retryAfterMs ?? null;
  }
}

/** 5xx: a problem on Metrc's side. */
export class ServerError extends RetailIdApiError {
  override name = 'ServerError';
}

/**
 * The request timed out before a reply.
 *
 * For calls that change data (generate, associate, merge, sales) the request
 * may still have been applied. Check the current state (`getPackagesInfo` or
 * `receive`) before resending.
 */
export class RetailIdTimeoutError extends RetailIdError {
  override name = 'RetailIdTimeoutError';
  readonly method: string;
  readonly path: string;
  /** The per-attempt timeout that elapsed, in milliseconds. */
  readonly timeoutMs: number;

  constructor(method: string, path: string, timeoutMs: number, cause?: unknown) {
    super(`${method} ${path} timed out after ${timeoutMs} ms`, { cause });
    this.method = method;
    this.path = path;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * The request failed in transport (DNS failure, connection refused or reset,
 * TLS error, ...). The original error is available as `cause`.
 *
 * Network failures are never retried automatically. For calls that change
 * data, the request may have reached the server; check state before resending.
 */
export class RetailIdNetworkError extends RetailIdError {
  override name = 'RetailIdNetworkError';
  readonly method: string;
  readonly path: string;

  constructor(method: string, path: string, cause: unknown) {
    super(`${method} ${path} failed: ${describeCause(cause)}`, { cause });
    this.method = method;
    this.path = path;
  }
}

/**
 * A 2xx response whose body does not match the documented contract (wrong
 * JSON shape, or a field with the wrong type).
 *
 * The request itself succeeded. For calls that change data it has been
 * applied: do not resend it; inspect `body` and check state instead.
 */
export class RetailIdResponseError extends RetailIdError {
  override name = 'RetailIdResponseError';
  readonly method: string;
  readonly path: string;
  /** HTTP status of the (successful) response, or `null` outside a request. */
  readonly statusCode: number | null;
  /** The offending field path, e.g. `"PackageInfo.QrCount"`, or `null` for the whole body. */
  readonly field: string | null;
  /** The decoded response body. */
  readonly body: JsonValue;

  constructor(
    message: string,
    details: RequestContext & { statusCode?: number | null; field?: string | null; body?: JsonValue; cause?: unknown } = {},
  ) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
    this.method = details.method ?? '';
    this.path = details.path ?? '';
    this.statusCode = details.statusCode ?? null;
    this.field = details.field ?? null;
    this.body = details.body ?? null;
  }
}

/** Configuration is missing, unreadable, or invalid. */
export class RetailIdConfigError extends RetailIdError {
  override name = 'RetailIdConfigError';
}

/** Header source accepted by {@link errorForStatus}. Lookups are case-insensitive. */
export type HeaderSource = Headers | Readonly<Record<string, string>>;

const ERRORS_BY_STATUS: Readonly<Record<number, typeof RetailIdApiError>> = {
  400: BadRequestError,
  401: AuthenticationError,
  403: PermissionDeniedError,
  404: NotFoundError,
  409: ConflictError,
  422: UnprocessableError,
};

/** @internal Extracts the API error text: `Message`/`message`, joined for lists, raw text, else `"Request failed"`. */
export function messageFrom(payload: JsonValue): string {
  let message = '';
  if (isJsonObject(payload)) {
    message = stringOrEmpty(payload['Message']) || stringOrEmpty(payload['message']);
  } else if (Array.isArray(payload) && payload.length > 0 && isJsonObject(payload[0])) {
    message = payload
      .map((item) => (isJsonObject(item) ? stringOrEmpty(item['message']) || stringOrEmpty(item['Message']) : ''))
      .join('; ');
  } else if (typeof payload === 'string') {
    message = payload;
  }
  return message || 'Request failed';
}

const stringOrEmpty = (value: JsonValue | undefined): string =>
  value === undefined || value === null ? '' : typeof value === 'string' ? value : JSON.stringify(value);

/**
 * @internal Parses a numeric `Retry-After` header (seconds) into milliseconds.
 * Negative values clamp to 0. HTTP-date and other non-numeric values return
 * `null` (the client then falls back to exponential backoff), matching Python.
 */
export function parseRetryAfterMs(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const text = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Math.round(Math.max(0, Number(text)) * 1000);
}

const headerValue = (headers: HeaderSource, name: string): string | null => {
  if (typeof Headers !== 'undefined' && headers instanceof Headers) return headers.get(name);
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers as Record<string, string>)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return null;
};

/**
 * Builds the error for a non-2xx response.
 *
 * @param status  HTTP status code.
 * @param payload Decoded response body (JSON, text, or `null`).
 * @param headers Response headers; `Retry-After` is read case-insensitively.
 * @param context Optional method and path for the message.
 */
export function errorForStatus(
  status: number,
  payload: JsonValue,
  headers: HeaderSource = {},
  context: RequestContext = {},
): RetailIdApiError {
  const message = messageFrom(payload);
  const details = { ...context, body: payload };
  if (status === 429) {
    return new RateLimitError(status, message, {
      ...details,
      retryAfterMs: parseRetryAfterMs(headerValue(headers, 'Retry-After')),
    });
  }
  const ErrorClass = ERRORS_BY_STATUS[status] ?? (status >= 500 ? ServerError : RetailIdApiError);
  return new ErrorClass(status, message, details);
}

/** @internal One-line description of a transport error, including a nested system error code if present. */
export function describeCause(cause: unknown): string {
  if (!(cause instanceof Error)) return String(cause);
  const nested = (cause as { cause?: unknown }).cause;
  const code =
    (cause as { code?: unknown }).code ??
    (nested !== null && typeof nested === 'object' ? (nested as { code?: unknown }).code : undefined);
  return typeof code === 'string' && !cause.message.includes(code) ? `${cause.message} (${code})` : cause.message;
}
