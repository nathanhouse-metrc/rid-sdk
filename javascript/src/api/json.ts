// Copyright 2025 Metrc, LLC
// SPDX-License-Identifier: MIT

/** A JSON primitive. */
export type JsonPrimitive = string | number | boolean | null;

/** Any JSON value, as produced by `JSON.parse`. */
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/** A JSON object. */
export type JsonObject = { [key: string]: JsonValue };

/** @internal True for a non-null, non-array object (a JSON object). */
export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @internal Short type description used in error messages; never includes the value itself. */
export function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** @internal True when `key` is an own property of `object`. */
export function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}
