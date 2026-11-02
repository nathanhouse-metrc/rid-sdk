// Copyright 2025 Metrc, LLC
// SPDX-License-Identifier: MIT
//
// The shared `config.json` schema used by the Python, Java and JavaScript
// clients. Keys are snake_case and durations are in SECONDS, exactly as in
// python/config.example.json. RetailIdClient options use milliseconds; the
// conversion happens once, in toClientOptions().
//
// This module has no Node.js imports so `@metrc/retailid/api` stays
// isomorphic. Reading the file lives in `@metrc/retailid/node`.

import {
  DEFAULT_BACKOFF_BASE_MS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMER_MS,
} from './constants.js';
import { RetailIdConfigError } from './errors.js';
import { describeType, hasOwn, isJsonObject } from './json.js';

/** The `config.json` object. Durations are in seconds. */
export interface RetailIdConfigData {
  vendor_api_key: string;
  user_api_key: string;
  /** Market code, e.g. `"md"` -> `https://api-md.metrc.com`. One of state_code/base_url is required. */
  state_code?: string | null;
  /** Full base URL; overrides state_code (use for the Sandbox). */
  base_url?: string | null;
  /** Per-request timeout in seconds (default 30). */
  timeout?: number | null;
  /** Retries for retryable responses (default 3). */
  max_retries?: number | null;
  /** Base backoff delay in seconds (default 1.0). */
  backoff_base?: number | null;
}

/** The subset of client options a config supplies (milliseconds). */
export interface ConfigClientOptions {
  vendorApiKey: string;
  userApiKey: string;
  stateCode?: string;
  baseUrl?: string;
  timeoutMs: number;
  maxRetries: number;
  backoffBaseMs: number;
}

const inspectSymbol = Symbol.for('nodejs.util.inspect.custom');

/**
 * Validated settings for a {@link RetailIdClient}. Create with
 * {@link RetailIdConfig.fromObject} (or `loadConfig` from `@metrc/retailid/node`).
 *
 * API keys are held in private fields: they never appear in `toString()`,
 * `util.inspect`, `JSON.stringify`, or `Object.keys`.
 */
export class RetailIdConfig {
  readonly #vendorApiKey: string;
  readonly #userApiKey: string;
  /** Market code, or `null` if `baseUrl` is used. */
  readonly stateCode: string | null;
  /** Base URL, or `null` if `stateCode` is used. */
  readonly baseUrl: string | null;
  /** Per-request timeout in seconds. */
  readonly timeoutSeconds: number;
  /** Maximum retries for retryable responses. */
  readonly maxRetries: number;
  /** Base backoff delay in seconds. */
  readonly backoffBaseSeconds: number;

  private constructor(fields: {
    vendorApiKey: string;
    userApiKey: string;
    stateCode: string | null;
    baseUrl: string | null;
    timeoutSeconds: number;
    maxRetries: number;
    backoffBaseSeconds: number;
  }) {
    this.#vendorApiKey = fields.vendorApiKey;
    this.#userApiKey = fields.userApiKey;
    this.stateCode = fields.stateCode;
    this.baseUrl = fields.baseUrl;
    this.timeoutSeconds = fields.timeoutSeconds;
    this.maxRetries = fields.maxRetries;
    this.backoffBaseSeconds = fields.backoffBaseSeconds;
    Object.freeze(this);
  }

  /**
   * Validates a parsed `config.json` object. Unknown keys are ignored; `null`
   * optional values mean "use the default" (as in config.example.json).
   *
   * @throws RetailIdConfigError describing the first problem found (never echoing key values).
   */
  static fromObject(data: unknown): RetailIdConfig {
    if (!isJsonObject(data)) {
      throw new RetailIdConfigError(`Config must be a JSON object, got ${describeType(data)}`);
    }
    const missing = ['vendor_api_key', 'user_api_key'].filter((key) => isAbsent(data[key]));
    if (missing.length > 0) throw new RetailIdConfigError(`Config is missing required keys: ${missing.join(', ')}`);
    for (const key of ['vendor_api_key', 'user_api_key']) {
      if (typeof data[key] !== 'string') {
        throw new RetailIdConfigError(`Config ${key} must be a string, got ${describeType(data[key])}`);
      }
    }
    const stateCode = optionalString(data, 'state_code');
    const baseUrl = optionalString(data, 'base_url');
    if (stateCode === null && baseUrl === null) {
      throw new RetailIdConfigError('Config must set either state_code or base_url');
    }
    const timeoutSeconds = optionalNumber(data, 'timeout', DEFAULT_TIMEOUT_MS / 1000);
    if (!(timeoutSeconds > 0) || timeoutSeconds * 1000 > MAX_TIMER_MS) {
      throw new RetailIdConfigError('Config timeout must be greater than 0 seconds (and at most 2147483 seconds)');
    }
    const maxRetries = optionalNumber(data, 'max_retries', DEFAULT_MAX_RETRIES);
    if (!Number.isSafeInteger(maxRetries) || maxRetries < 0) {
      throw new RetailIdConfigError('Config max_retries must be a non-negative integer');
    }
    const backoffBaseSeconds = optionalNumber(data, 'backoff_base', DEFAULT_BACKOFF_BASE_MS / 1000);
    if (!(backoffBaseSeconds >= 0) || backoffBaseSeconds * 1000 > MAX_TIMER_MS) {
      throw new RetailIdConfigError('Config backoff_base must be 0 or more seconds');
    }
    return new RetailIdConfig({
      vendorApiKey: data['vendor_api_key'] as string,
      userApiKey: data['user_api_key'] as string,
      stateCode,
      baseUrl,
      timeoutSeconds,
      maxRetries,
      backoffBaseSeconds,
    });
  }

  /** The vendor (software) API key. Not enumerable; not shown by inspection. */
  get vendorApiKey(): string {
    return this.#vendorApiKey;
  }

  /** The user API key. Not enumerable; not shown by inspection. */
  get userApiKey(): string {
    return this.#userApiKey;
  }

  /** Client options in milliseconds (seconds × 1000, rounded). */
  toClientOptions(): ConfigClientOptions {
    return {
      vendorApiKey: this.#vendorApiKey,
      userApiKey: this.#userApiKey,
      ...(this.stateCode !== null ? { stateCode: this.stateCode } : {}),
      ...(this.baseUrl !== null ? { baseUrl: this.baseUrl } : {}),
      timeoutMs: Math.round(this.timeoutSeconds * 1000),
      maxRetries: this.maxRetries,
      backoffBaseMs: Math.round(this.backoffBaseSeconds * 1000),
    };
  }

  /** Safe description (no keys). */
  toString(): string {
    return (
      `RetailIdConfig(stateCode=${this.stateCode}, baseUrl=${this.baseUrl}, ` +
      `timeoutSeconds=${this.timeoutSeconds}, maxRetries=${this.maxRetries})`
    );
  }

  /** Safe JSON form (no keys). */
  toJSON(): Record<string, unknown> {
    return {
      stateCode: this.stateCode,
      baseUrl: this.baseUrl,
      timeoutSeconds: this.timeoutSeconds,
      maxRetries: this.maxRetries,
      backoffBaseSeconds: this.backoffBaseSeconds,
    };
  }

  /** Safe Node.js `util.inspect` form (no keys). */
  [inspectSymbol](): string {
    return this.toString();
  }
}

/** Absent, null, or a blank string (Python treats these as missing). */
const isAbsent = (value: unknown): boolean =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

function optionalString(data: Record<string, unknown>, key: string): string | null {
  const value = hasOwn(data, key) ? data[key] : undefined;
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new RetailIdConfigError(`Config ${key} must be a string, got ${describeType(value)}`);
  return value;
}

function optionalNumber(data: Record<string, unknown>, key: string, fallback: number): number {
  const value = hasOwn(data, key) ? data[key] : undefined;
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RetailIdConfigError(`Config ${key} must be a number, got ${describeType(value)}`);
  }
  return value;
}
