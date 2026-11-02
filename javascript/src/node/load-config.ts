// Copyright 2025 Metrc, LLC
// SPDX-License-Identifier: MIT
//
// Node.js-only configuration loading (@metrc/retailid/node). Mirrors Python
// `load_config` / `RetailIdClient.from_config(path)` and Java
// `RetailIdConfig.load` / `RetailIdClient.fromConfig(path)`.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  CONFIG_ENV_VAR,
  DEFAULT_CONFIG_FILE,
  RetailIdClient,
  RetailIdConfig,
  RetailIdConfigError,
} from '../api/index.js';
import type { RetailIdClientOptions } from '../api/index.js';

/**
 * Reads and validates a `config.json` file.
 *
 * Resolution order (same as Python/Java): `path` if given, else
 * `$RETAILID_CONFIG` if set and non-empty, else `./config.json`. Relative paths
 * resolve against the current working directory.
 *
 * @throws RetailIdConfigError if the file is missing, unreadable, not valid
 *   JSON, not a JSON object, or fails validation. Messages never include key values.
 */
export async function loadConfig(path?: string | URL): Promise<RetailIdConfig> {
  let file: string;
  if (path instanceof URL) file = fileURLToPath(path);
  else if (path === undefined) file = process.env[CONFIG_ENV_VAR] || DEFAULT_CONFIG_FILE;
  else if (typeof path === 'string' && path.trim() !== '') file = path;
  else throw new TypeError('path must be a non-empty string or a file URL');
  const fullPath = resolve(process.cwd(), file);

  let text: string;
  try {
    text = await readFile(fullPath, 'utf8');
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === 'ENOENT') throw new RetailIdConfigError(`Config file not found: ${fullPath}`, { cause: error });
    throw new RetailIdConfigError(`Config file could not be read: ${fullPath} (${String(code ?? 'error')})`, {
      cause: error,
    });
  }

  let data: unknown;
  try {
    data = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (error) {
    throw new RetailIdConfigError(`Config file is not valid JSON: ${fullPath}: ${(error as Error).message}`, {
      cause: error,
    });
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new RetailIdConfigError(`Config file must contain a JSON object: ${fullPath}`);
  }
  return RetailIdConfig.fromObject(data);
}

/**
 * Builds a client from a `config.json` file (Python `RetailIdClient.from_config(path)`).
 * `overrides` (milliseconds) take precedence over the file's values.
 */
export async function createClientFromConfigFile(
  path?: string | URL,
  overrides: Partial<RetailIdClientOptions> = {},
): Promise<RetailIdClient> {
  return RetailIdClient.fromConfig(await loadConfig(path), overrides);
}
