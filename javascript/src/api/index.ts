// Copyright 2025 Metrc, LLC
// SPDX-License-Identifier: MIT
//
// @metrc/retailid/api — Retail ID API client (server-side only).
// No Node.js built-ins are imported here; file-based configuration lives in
// @metrc/retailid/node.

export { RetailIdClient } from './client.js';
export type {
  CallOptions,
  FetchLike,
  GlobalProductsOptions,
  HttpMethod,
  PostSalesOptions,
  RequestOptions,
  RetailIdClientOptions,
  RetailIdLogger,
  Sleep,
} from './client.js';
export { RetailIdConfig } from './config.js';
export type { ConfigClientOptions, RetailIdConfigData } from './config.js';
export { CONFIG_ENV_VAR, DEFAULT_CONFIG_FILE, MAX_RECORDS_PER_REQUEST, SALES_ENDPOINTS } from './constants.js';
export type { SalesEndpoint } from './constants.js';
export {
  AuthenticationError,
  BadRequestError,
  ConflictError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  RetailIdApiError,
  RetailIdConfigError,
  RetailIdError,
  RetailIdNetworkError,
  RetailIdResponseError,
  RetailIdTimeoutError,
  ServerError,
  UnprocessableError,
  errorForStatus,
} from './errors.js';
export type { HeaderSource, RequestContext } from './errors.js';
export type { JsonObject, JsonPrimitive, JsonValue } from './json.js';
export { Allotment, Association, GenerateResult, Issuance, PackageInfo, ReceiveResult } from './models.js';
export type { AssociationWire } from './models.js';
export { shortCodeFromUrl } from './url.js';
export type { QueryValue } from './url.js';
