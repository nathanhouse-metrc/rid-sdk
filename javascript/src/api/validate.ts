// Copyright 2025 Metrc, LLC
// SPDX-License-Identifier: MIT
//
// Argument validation (approved decision D5). Rule:
//   * TypeError  — the argument has the wrong JavaScript type;
//   * RangeError — the type is right but the value is not allowed.
// Nothing is coerced: "3" is not accepted where a number is required.
// Messages name the argument but never echo credential values.

import { MAX_RECORDS_PER_REQUEST } from './constants.js';
import { describeType, isJsonObject } from './json.js';
import type { JsonObject } from './json.js';

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** @internal A non-empty string without control characters. */
export function requireString(name: string, value: unknown): string {
  if (typeof value !== 'string') throw new TypeError(`${name} must be a string, got ${describeType(value)}`);
  if (value.trim() === '') throw new RangeError(`${name} must not be empty`);
  if (CONTROL_CHARS.test(value)) throw new RangeError(`${name} must not contain control characters`);
  return value;
}

/** @internal An integer >= `min` (safe integer, no strings). */
export function requireInteger(name: string, value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number') throw new TypeError(`${name} must be a number, got ${describeType(value)}`);
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be an integer, got ${value}`);
  if (value < min || value > max) throw new RangeError(`${name} must be between ${min} and ${max}, got ${value}`);
  return value;
}

/** @internal A Metrc numeric ID or label: a non-empty string or a non-negative safe integer. */
export function requireIdOrLabel(name: string, value: unknown): string {
  if (typeof value === 'number') return String(requireInteger(name, value, 0));
  if (typeof value === 'string') return requireString(name, value);
  throw new TypeError(`${name} must be a string or number, got ${describeType(value)}`);
}

/** @internal 1..MAX_RECORDS_PER_REQUEST entries (Python `_check_batch`). */
export function requireBatch<T>(name: string, value: unknown): readonly T[] {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array, got ${describeType(value)}`);
  if (value.length === 0) throw new RangeError(`${name} must not be empty`);
  if (value.length > MAX_RECORDS_PER_REQUEST) {
    throw new RangeError(
      `${name} has ${value.length} records; send no more than ${MAX_RECORDS_PER_REQUEST} per request`,
    );
  }
  return value as readonly T[];
}

/** @internal A plain JSON object (not null, not an array). */
export function requireJsonObject(name: string, value: unknown): JsonObject {
  if (!isJsonObject(value)) throw new TypeError(`${name} must be an object, got ${describeType(value)}`);
  return value;
}

/** @internal An optional AbortSignal. */
export function optionalSignal(name: string, value: unknown): AbortSignal | undefined {
  if (value === undefined) return undefined;
  if (!(value instanceof AbortSignal)) throw new TypeError(`${name} must be an AbortSignal, got ${describeType(value)}`);
  return value;
}

/** @internal An optional options object. */
export function optionsObject(name: string, value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object, got ${describeType(value)}`);
  }
  return value as Record<string, unknown>;
}
