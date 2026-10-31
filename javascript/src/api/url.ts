// Copyright 2025 Metrc, LLC
// SPDX-License-Identifier: MIT

import { describeType } from './json.js';
import { requireString } from './validate.js';

/** Query parameter value. `null`/`undefined` values are omitted from the query string. */
export type QueryValue = string | number | boolean | null | undefined;

const SHORT_CODE = /^[A-Za-z0-9_-]+$/;

/**
 * Returns the short code from a scanned Retail ID QR URL.
 *
 * `https://1a4.com/ZScU6dsbUk98nsJEAA` -> `ZScU6dsbUk98nsJEAA`. A value that is
 * already a short code is returned unchanged. Query strings and fragments are
 * ignored; a URL without a scheme (`1a4.com/ABC`) is accepted.
 *
 * Stricter than Python's `short_code_from_url` (see the parity matrix):
 * a URL whose path has more than one segment is rejected as ambiguous, and the
 * code must contain only Base36/URL-safe Base64 characters.
 *
 * @throws TypeError if the value is not a string.
 * @throws RangeError if no single, well-formed short code is present.
 */
export function shortCodeFromUrl(qrUrlOrShortCode: string): string {
  const value = requireString('qrUrlOrShortCode', qrUrlOrShortCode).trim();
  let code = value;
  if (value.includes('/')) {
    let url: URL;
    try {
      url = new URL(value.includes('://') ? value : `https://${value}`);
    } catch {
      throw new RangeError(`Not a valid QR URL: '${value}'`);
    }
    const segments = url.pathname.split('/').filter((segment) => segment !== '');
    if (segments.length === 0) throw new RangeError(`No short code found in '${value}'`);
    if (segments.length > 1) {
      throw new RangeError(`Ambiguous QR URL '${value}': expected exactly one path segment (the short code)`);
    }
    code = segments[0] as string;
  }
  if (!SHORT_CODE.test(code)) throw new RangeError(`Malformed short code in '${value}'`);
  return code;
}

/**
 * @internal Percent-encodes one path segment, leaving only RFC 3986 unreserved
 * characters (`A-Z a-z 0-9 - . _ ~`). Matches Python `quote(s, safe="")` and
 * Java `quotePathSegment`; `encodeURIComponent` alone leaves `!'()*` unencoded.
 */
export function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * @internal Builds `?licenseNumber=...&...`. `licenseNumber` comes first; a
 * `licenseNumber` key in `params` overrides it (Python order). `null` and
 * `undefined` values are omitted. Booleans serialize as `true`/`false`
 * (Python's `requests` sends `True`/`False`; documented divergence).
 */
export function buildQuery(
  licenseNumber: string | undefined,
  params: Readonly<Record<string, QueryValue>> | undefined,
): string {
  const query = new URLSearchParams();
  if (licenseNumber !== undefined) query.set('licenseNumber', licenseNumber);
  if (params !== undefined) {
    if (typeof params !== 'object' || params === null || Array.isArray(params)) {
      throw new TypeError(`params must be an object, got ${describeType(params)}`);
    }
    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined) continue;
      if (typeof value === 'number' && !Number.isFinite(value)) {
        throw new RangeError(`params.${key} must be a finite number`);
      }
      if (!['string', 'number', 'boolean'].includes(typeof value)) {
        throw new TypeError(`params.${key} must be a string, number or boolean, got ${describeType(value)}`);
      }
      query.set(key, String(value));
    }
  }
  const text = query.toString();
  return text === '' ? '' : `?${text}`;
}
