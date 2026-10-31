// Copyright 2025 Metrc, LLC
// SPDX-License-Identifier: MIT

/**
 * Section 10 of the integration guide: "When a request takes a list of
 * records, send no more than 10 per request." Same value as Python/Java.
 */
export const MAX_RECORDS_PER_REQUEST = 10;

/** Section 8: sales endpoints that accept Retail IDs in `Transactions[].QrCodes`. Keys match Python/Java. */
export const SALES_ENDPOINTS = Object.freeze({
  receipts: '/sales/v2/receipts',
  deliveries: '/sales/v2/deliveries',
  deliveries_retailer: '/sales/v2/deliveries/retailer',
  deliveries_retailer_sale: '/sales/v2/deliveries/retailer/sale',
} as const);

/** A key of {@link SALES_ENDPOINTS}. */
export type SalesEndpoint = keyof typeof SALES_ENDPOINTS;

/** Name of the environment variable that points at `config.json`. */
export const CONFIG_ENV_VAR = 'RETAILID_CONFIG';

/** Config file read when no path or environment variable is given. */
export const DEFAULT_CONFIG_FILE = 'config.json';

/** @internal Client defaults (milliseconds), equal to Python/Java's 30 s / 3 / 1 s. */
export const DEFAULT_TIMEOUT_MS = 30_000;
/** @internal */
export const DEFAULT_MAX_RETRIES = 3;
/** @internal */
export const DEFAULT_BACKOFF_BASE_MS = 1_000;
/** @internal Largest delay `setTimeout` supports (2^31 - 1 ms). */
export const MAX_TIMER_MS = 2_147_483_647;
