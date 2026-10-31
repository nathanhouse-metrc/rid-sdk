// Copyright 2025 Metrc, LLC
// SPDX-License-Identifier: MIT
//
// Response and request models.
//
// D2 coercion policy (interim — pending Nathan's approval; see README "Response
// models"). Every field read goes through the readers below, so the policy
// lives in one place:
//
//   absent or null           -> null for scalars, [] for lists (never a
//                               fabricated 0 / false / "")
//   correctly typed value    -> used as-is
//   integer as a JSON string -> accepted only if it is a canonical integer
//                               ("5000"); Python int() and Java asInteger
//                               accept these too
//   anything else            -> RetailIdResponseError naming the field
//                               ("abc", 12.7, "false", {} for a number, ...)
//   unknown properties       -> preserved in `raw`
//
// Divergences from Python (which defaults missing counts/flags to 0/False and
// treats "false" as True) and Java (which truncates 12.7 and maps "abc" to 0)
// are deliberate and listed in the parity matrix.

import { RetailIdResponseError } from './errors.js';
import { describeType, hasOwn, isJsonObject } from './json.js';
import type { JsonObject, JsonValue } from './json.js';
import { requireString } from './validate.js';

const CANONICAL_INTEGER = /^-?(0|[1-9]\d*)$/;

function malformed(model: string, field: string, expected: string, value: unknown): never {
  throw new RetailIdResponseError(`${model}.${field}: expected ${expected}, got ${describeType(value)}`, {
    field: `${model}.${field}`,
  });
}

const read = (data: JsonObject, key: string): JsonValue | undefined => (hasOwn(data, key) ? data[key] : undefined);

/** @internal Integer or canonical integer string; absent/null -> null. */
function integer(model: string, data: JsonObject, key: string): number | null {
  const value = read(data, key);
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value === 'string' && CANONICAL_INTEGER.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return malformed(model, key, 'an integer', value);
}

/** @internal JSON boolean only; absent/null -> null. */
function boolean(model: string, data: JsonObject, key: string): boolean | null {
  const value = read(data, key);
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value;
  return malformed(model, key, 'a boolean', value);
}

/** @internal JSON string only; absent/null -> null. */
function string(model: string, data: JsonObject, key: string): string | null {
  const value = read(data, key);
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  return malformed(model, key, 'a string', value);
}

/** @internal Array of strings; absent/null -> []. */
function stringList(model: string, data: JsonObject, key: string): readonly string[] {
  const value = read(data, key);
  if (value === undefined || value === null) return Object.freeze([]);
  if (!Array.isArray(value)) return malformed(model, key, 'an array', value);
  value.forEach((item, index) => {
    if (typeof item !== 'string') malformed(model, `${key}[${index}]`, 'a string', item);
  });
  return Object.freeze([...(value as string[])]);
}

/** @internal Array of objects; absent/null -> []. */
function objectList(model: string, data: JsonObject, key: string): readonly JsonObject[] {
  const value = read(data, key);
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return malformed(model, key, 'an array', value);
  value.forEach((item, index) => {
    if (!isJsonObject(item)) malformed(model, `${key}[${index}]`, 'an object', item);
  });
  return value as JsonObject[];
}

function requireObject(model: string, data: unknown): JsonObject {
  if (!isJsonObject(data)) {
    throw new RetailIdResponseError(`${model}: expected a JSON object, got ${describeType(data)}`, { field: model });
  }
  return data;
}

const frozenRaw = (data: JsonObject): Readonly<JsonObject> => Object.freeze({ ...data });

// ---------------------------------------------------------------------------
// Response models
// ---------------------------------------------------------------------------

/** A New York facility's remaining Retail Item ID allotment (`GET /retailid/v2/allotment`). */
export interface Allotment {
  readonly facilityId: number | null;
  readonly facilityLicenseNumber: string | null;
  /** Remaining Retail Item IDs; `null` if the response omitted it (never a fabricated 0). */
  readonly allotment: number | null;
  /** The full response object, including fields not modeled here. */
  readonly raw: Readonly<JsonObject>;
}

/** Result of one Generate run (`POST /retailid/v2/generate`). */
export interface GenerateResult {
  /** The issuance ID, usable for printing; `null` if the response omitted it. */
  readonly issuanceId: string | null;
  readonly raw: Readonly<JsonObject>;
}

/** One Generate run recorded against a package. */
export interface Issuance {
  readonly labelSet: number | null;
  readonly labelQuantity: number | null;
  readonly createdAt: string | null;
  readonly raw: Readonly<JsonObject>;
}

/** Retail ID details for a package (`POST /retailid/v2/packages/info`). */
export interface PackageInfo {
  /** `PackageLabel`, or `Label` when `PackageLabel` is absent or empty (as in Python). */
  readonly packageLabel: string | null;
  readonly qrCount: number | null;
  readonly hasQrs: boolean | null;
  readonly issuances: readonly Issuance[];
  readonly siblingCount: number | null;
  readonly requiresVerification: boolean | null;
  readonly estimatedBalance: number | null;
  readonly raw: Readonly<JsonObject>;
}

/** A package's QR URLs and receiving status (`GET /retailid/v2/receive/...`). */
export interface ReceiveResult {
  /** QR URLs of the units; print one label per URL, exactly as returned. */
  readonly eaches: readonly string[];
  readonly siblingTags: readonly string[];
  readonly requiresVerification: boolean | null;
  readonly childTag: string | null;
  readonly labelSource: string | null;
  readonly qrCount: number | null;
  /** Passed through unmodeled (its shape is not documented). */
  readonly ranges: JsonValue;
  readonly raw: Readonly<JsonObject>;
}

/** Parsers for {@link Allotment}. */
export const Allotment = Object.freeze({
  /** @throws RetailIdResponseError if `data` is not an object or a field has the wrong type. */
  fromJson(data: unknown): Allotment {
    const obj = requireObject('Allotment', data);
    return Object.freeze({
      facilityId: integer('Allotment', obj, 'FacilityId'),
      facilityLicenseNumber: string('Allotment', obj, 'FacilityLicenseNumber'),
      allotment: integer('Allotment', obj, 'Allotment'),
      raw: frozenRaw(obj),
    });
  },
});

/** Parsers for {@link GenerateResult}. */
export const GenerateResult = Object.freeze({
  /** @throws RetailIdResponseError if `data` is not an object or `IssuanceId` is not a string/integer. */
  fromJson(data: unknown): GenerateResult {
    const obj = requireObject('GenerateResult', data);
    const value = read(obj, 'IssuanceId');
    let issuanceId: string | null;
    if (value === undefined || value === null) issuanceId = null;
    else if (typeof value === 'string') issuanceId = value;
    else if (typeof value === 'number' && Number.isSafeInteger(value)) issuanceId = String(value);
    else issuanceId = malformed('GenerateResult', 'IssuanceId', 'a string', value);
    return Object.freeze({ issuanceId, raw: frozenRaw(obj) });
  },
});

/** Parsers for {@link Issuance}. */
export const Issuance = Object.freeze({
  fromJson(data: unknown): Issuance {
    const obj = requireObject('Issuance', data);
    return Object.freeze({
      labelSet: integer('Issuance', obj, 'LabelSet'),
      labelQuantity: integer('Issuance', obj, 'LabelQuantity'),
      createdAt: string('Issuance', obj, 'CreatedAt'),
      raw: frozenRaw(obj),
    });
  },
});

/** Parsers for {@link PackageInfo}. */
export const PackageInfo = Object.freeze({
  fromJson(data: unknown): PackageInfo {
    const obj = requireObject('PackageInfo', data);
    const primary = string('PackageInfo', obj, 'PackageLabel');
    return Object.freeze({
      packageLabel: primary !== null && primary !== '' ? primary : string('PackageInfo', obj, 'Label'),
      qrCount: integer('PackageInfo', obj, 'QrCount'),
      hasQrs: boolean('PackageInfo', obj, 'HasQrs'),
      issuances: Object.freeze(objectList('PackageInfo', obj, 'Issuances').map((i) => Issuance.fromJson(i))),
      siblingCount: integer('PackageInfo', obj, 'SiblingCount'),
      requiresVerification: boolean('PackageInfo', obj, 'RequiresVerification'),
      estimatedBalance: integer('PackageInfo', obj, 'EstimatedBalance'),
      raw: frozenRaw(obj),
    });
  },
});

/** Parsers for {@link ReceiveResult}. */
export const ReceiveResult = Object.freeze({
  fromJson(data: unknown): ReceiveResult {
    const obj = requireObject('ReceiveResult', data);
    const ranges = read(obj, 'Ranges');
    return Object.freeze({
      eaches: stringList('ReceiveResult', obj, 'Eaches'),
      siblingTags: stringList('ReceiveResult', obj, 'SiblingTags'),
      requiresVerification: boolean('ReceiveResult', obj, 'RequiresVerification'),
      childTag: string('ReceiveResult', obj, 'ChildTag'),
      labelSource: string('ReceiveResult', obj, 'LabelSource'),
      qrCount: integer('ReceiveResult', obj, 'QrCount'),
      ranges: ranges === undefined ? null : ranges,
      raw: frozenRaw(obj),
    });
  },
});

// ---------------------------------------------------------------------------
// Request model
// ---------------------------------------------------------------------------

/** One Scan and Associate entry: a package and the full QR URLs of the units in it. */
export interface Association {
  readonly packageLabel: string;
  readonly qrUrls: readonly string[];
}

/** The wire form of an {@link Association}, also accepted as input. */
export interface AssociationWire {
  PackageLabel: string;
  QrUrls: string[];
}

/** Helpers for {@link Association}. */
export const Association = Object.freeze({
  /**
   * Converts an {@link Association} (or an already wire-shaped entry) to the
   * request body form `{ PackageLabel, QrUrls }`.
   *
   * @throws TypeError/RangeError if the entry has neither shape or invalid values.
   */
  toJson(entry: Association | AssociationWire): AssociationWire {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new TypeError(`association must be an object, got ${describeType(entry)}`);
    }
    const wire = hasOwn(entry, 'PackageLabel') || hasOwn(entry, 'QrUrls');
    const label = wire ? (entry as AssociationWire).PackageLabel : (entry as Association).packageLabel;
    const urls = wire ? (entry as AssociationWire).QrUrls : (entry as Association).qrUrls;
    const field = wire ? 'QrUrls' : 'qrUrls';
    const packageLabel = requireString(wire ? 'association.PackageLabel' : 'association.packageLabel', label);
    if (!Array.isArray(urls)) throw new TypeError(`association.${field} must be an array, got ${describeType(urls)}`);
    const qrUrls = urls.map((url, index) => requireString(`association.${field}[${index}]`, url));
    return { PackageLabel: packageLabel, QrUrls: qrUrls };
  },
});
