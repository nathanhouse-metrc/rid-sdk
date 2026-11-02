// Copyright 2025 Metrc, LLC
// SPDX-License-Identifier: MIT
//
// Verifies the publishable @metrc/retailid package as a consumer sees it:
//
//   1. `npm pack` contents match the expected file list exactly.
//   2. The packed tarball installs into a throwaway project.
//   3. ESM `import` and CJS `require` expose exactly the public exports of
//      every entry point (`.`, `./api`, `./node`), decode a known QR vector, and
//      share one class identity between `./api` and `./node`.
//   4. TypeScript resolves the declarations of every entry point under every
//      common module mode.
//
// Run after `npm run build`: `npm run verify:package`.
// Nothing is published; all work happens in a temporary directory.
//
// Cross-platform: no shell, no POSIX utilities. Node and npm are run through
// the current Node binary (see npmCli below), so it works on Windows too.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const tscBin = require.resolve('typescript/bin/tsc');

// npm is a .cmd shim on Windows, and Node refuses to spawn .cmd files without a
// shell (CVE-2024-27980). Run npm's JavaScript entry point with this Node binary
// instead: no shell, no PATH lookup, identical behaviour on every platform.
const npmCli = (() => {
  const candidates = [];
  const fromNpmRun = process.env.npm_execpath; // set by `npm run`; may point to pnpm/yarn
  if (fromNpmRun && /npm-cli\.c?js$/.test(fromNpmRun)) candidates.push(fromNpmRun);
  const nodeDir = dirname(process.execPath);
  candidates.push(
    join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'), // Windows installer, nvm-windows
    join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'), // POSIX installs
  );
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    console.error(`verify-package: cannot locate npm-cli.js (looked in: ${candidates.join(', ')}). ` +
      'Run this script through `npm run verify:package`.');
    process.exit(1);
  }
  return found;
})();

const API_DECLARATION_MODULES = ['client', 'config', 'constants', 'errors', 'index', 'json', 'models', 'url', 'validate'];
const EXPECTED_FILES = [
  'README.md',
  ...API_DECLARATION_MODULES.flatMap((m) => [`dist/api/${m}.d.cts`, `dist/api/${m}.d.ts`]),
  'dist/api/index.cjs',
  'dist/api/index.cjs.map',
  'dist/api/index.js',
  'dist/api/index.js.map',
  'dist/index.d.cts',
  'dist/index.d.ts',
  'dist/node/index.cjs',
  'dist/node/index.cjs.map',
  'dist/node/index.d.cts',
  'dist/node/index.d.ts',
  'dist/node/index.js',
  'dist/node/index.js.map',
  'dist/node/load-config.d.cts',
  'dist/node/load-config.d.ts',
  'dist/retailid.cjs',
  'dist/retailid.cjs.map',
  'dist/retailid.esm.js',
  'dist/retailid.esm.js.map',
  'dist/retailid.min.js',
  'dist/retailid.min.js.map',
  'package.json',
];

const EXPECTED_EXPORTS = [
  'ObjectId',
  'RetailIdPair',
  'VarInt',
  'decodeBase36',
  'decodeUrl64',
  'encodeBase36',
  'encodeUrl64',
  'getShortUrl',
  'testBase36',
];

// Public runtime exports of @metrc/retailid/api and @metrc/retailid/node.
const API_EXPORTS = [
  'Allotment', 'Association', 'AuthenticationError', 'BadRequestError', 'CONFIG_ENV_VAR', 'ConflictError',
  'DEFAULT_CONFIG_FILE', 'GenerateResult', 'Issuance', 'MAX_RECORDS_PER_REQUEST', 'NotFoundError', 'PackageInfo',
  'PermissionDeniedError', 'RateLimitError', 'ReceiveResult', 'RetailIdApiError', 'RetailIdClient', 'RetailIdConfig',
  'RetailIdConfigError', 'RetailIdError', 'RetailIdNetworkError', 'RetailIdResponseError', 'RetailIdTimeoutError',
  'SALES_ENDPOINTS', 'ServerError', 'UnprocessableError', 'errorForStatus', 'shortCodeFromUrl',
];
const NODE_EXPORTS = ['createClientFromConfigFile', 'loadConfig'];

// Base36 vector for batch abcdef012345670000027190, index 1.
const VECTOR_URL = 'HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL';
const VECTOR_BATCH = 'abcdef012345670000027190';

const results = [];
const check = (name, fn) => {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail });
  } catch (error) {
    results.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
  }
};
const run = (command, args, cwd) => {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
    throw new Error(output || error.message);
  }
};
const node = (args, cwd) => run(process.execPath, args, cwd);
const npm = (args, cwd) => node([npmCli, ...args], cwd);
const sameList = (actual, expected, label) => {
  expected = [...expected].sort();
  const missing = expected.filter((x) => !actual.includes(x));
  const extra = actual.filter((x) => !expected.includes(x));
  if (missing.length || extra.length) {
    throw new Error(`${label}: missing [${missing.join(', ')}] extra [${extra.join(', ')}]`);
  }
  return `${actual.length} entries match`;
};

if (!existsSync(join(packageDir, 'dist', 'index.d.cts'))) {
  console.error('verify-package: dist/ is incomplete; run `npm run build` first.');
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), 'retailid-verify-package-'));
try {
  // 1. Pack contents.
  const [packed] = JSON.parse(npm(['pack', '--json', '--pack-destination', work], packageDir));
  const tarball = join(work, packed.filename);
  check('npm pack: exact file list', () =>
    sameList(packed.files.map((f) => f.path).sort(), EXPECTED_FILES, 'pack contents'),
  );

  // 2. Install into a throwaway consumer.
  const consumer = join(work, 'consumer');
  mkdirSync(consumer, { recursive: true });
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'consumer', private: true }));
  npm(['install', '--no-audit', '--no-fund', '--ignore-scripts', tarball], consumer);

  // 3. Runtime exports and behaviour.
  const probe = `
    const keys = Object.keys(m).filter((k) => k !== 'default' && k !== '__esModule').sort();
    const pair = new m.RetailIdPair(${JSON.stringify(VECTOR_URL)});
    console.log(JSON.stringify({ keys, batch: pair.batchId.toHexString(), index: pair.index }));
  `;
  const verifyRuntime = (output) => {
    const { keys, batch, index } = JSON.parse(output);
    sameList(keys, EXPECTED_EXPORTS, 'exports');
    if (batch !== VECTOR_BATCH || index !== 1) throw new Error(`decoded ${batch}/${index}`);
    return `${keys.length} exports; decodes vector`;
  };
  check('runtime: ESM import', () =>
    verifyRuntime(node(['--input-type=module', '-e', `import * as m from '@metrc/retailid';${probe}`], consumer)),
  );
  check('runtime: CJS require', () =>
    verifyRuntime(node(['-e', `const m = require('@metrc/retailid');${probe}`], consumer)),
  );

  // API and Node entry points: exact exports, a real call through a stub fetch
  // (no network), and one class identity across ./api and ./node.
  const apiProbe = `
    const keysOf = (x) => Object.keys(x).filter((k) => k !== 'default' && k !== '__esModule').sort();
    const client = new api.RetailIdClient({ vendorApiKey: 'v', userApiKey: 'u', stateCode: 'md',
      fetch: async () => new Response(JSON.stringify({ Eaches: ['https://1a4.com/ABC'] })) });
    const received = await client.receiveByQr('837-XYZ', 'https://1a4.com/ABC');
    const configError = await nodeEntry.loadConfig('definitely-missing-config.json').catch((e) => e);
    console.log(JSON.stringify({
      api: keysOf(api), node: keysOf(nodeEntry), eaches: received.eaches,
      sharedIdentity: configError instanceof api.RetailIdConfigError && configError instanceof api.RetailIdError,
    }));
  `;
  const verifyApi = (output) => {
    const result = JSON.parse(output);
    sameList(result.api, API_EXPORTS, 'api exports');
    sameList(result.node, NODE_EXPORTS, 'node exports');
    if (result.eaches[0] !== 'https://1a4.com/ABC') throw new Error('client call through stub fetch failed');
    if (!result.sharedIdentity) throw new Error('./node errors are not instances of ./api classes');
    return `${result.api.length} api + ${result.node.length} node exports; client call ok; shared class identity`;
  };
  check('runtime: ESM import ./api + ./node', () =>
    verifyApi(node(['--input-type=module', '-e',
      `import * as api from '@metrc/retailid/api'; import * as nodeEntry from '@metrc/retailid/node';${apiProbe}`], consumer)),
  );
  check('runtime: CJS require ./api + ./node', () =>
    verifyApi(node(['-e',
      `const api = require('@metrc/retailid/api'); const nodeEntry = require('@metrc/retailid/node');(async () => {${apiProbe}})().catch((e) => { console.error(e); process.exit(1); });`], consumer)),
  );

  // 4. Type resolution. Every public export is imported and used in a typed position.
  const source = `import {
  ObjectId, RetailIdPair, VarInt, decodeBase36, decodeUrl64,
  encodeBase36, encodeUrl64, getShortUrl, testBase36,
} from '@metrc/retailid';
const id: ObjectId = new ObjectId('${VECTOR_BATCH}');
const url: string = getShortUrl(id, 1, { domain: 'd.1a4.com', base64: false });
const pair: RetailIdPair = new RetailIdPair(url, true);
const index: number = pair.index;
const v: VarInt = new VarInt(index);
const bytes: Uint8Array = decodeBase36(encodeBase36(v.data()));
const valid: boolean = testBase36('ABC');
const roundTrip: string = encodeUrl64(decodeUrl64('q83v'));
export const used = [bytes, valid, roundTrip, pair.encode({ base64: true })];

import {
  RetailIdClient, RetailIdConfig, RetailIdError, RetailIdApiError, RateLimitError, shortCodeFromUrl,
  SALES_ENDPOINTS, MAX_RECORDS_PER_REQUEST,
} from '@metrc/retailid/api';
import type { PackageInfo, ReceiveResult, RetailIdClientOptions, SalesEndpoint, JsonValue } from '@metrc/retailid/api';
import { loadConfig, createClientFromConfigFile } from '@metrc/retailid/node';

const options: RetailIdClientOptions = { vendorApiKey: 'v', userApiKey: 'u', stateCode: 'md', timeoutMs: 5000 };
const client: RetailIdClient = new RetailIdClient(options);
const endpoint: SalesEndpoint = 'deliveries_retailer';
const limit: number = MAX_RECORDS_PER_REQUEST;
const path: string = SALES_ENDPOINTS[endpoint];
const code: string = shortCodeFromUrl('https://1a4.com/ABC');
export async function useApi(signal: AbortSignal): Promise<void> {
  const infos: PackageInfo[] = await client.getPackagesInfo('837-XYZ', ['1A4'], { signal });
  const received: ReceiveResult = await client.receive('837-XYZ', '1A4');
  const urls: readonly string[] | null = received.eaches;
  const qrCount: number | null = infos[0]?.qrCount ?? null;
  const raw: JsonValue = await client.merge('837-XYZ', 'A', 'B');
  const config: RetailIdConfig = await loadConfig('config.json');
  const fromFile: RetailIdClient = await createClientFromConfigFile(undefined, { maxRetries: 0 });
  try {
    await client.generate('837-XYZ', '1A4', 1);
  } catch (error) {
    if (error instanceof RateLimitError) { const ms: number | null = error.retryAfterMs; void ms; }
    else if (error instanceof RetailIdApiError) { const status: number = error.statusCode; void status; }
    else if (error instanceof RetailIdError) { void error.message; }
  }
  void [urls, qrCount, raw, config, fromFile, limit, path, code];
}
`;
  const modes = [
    { name: 'node16 ESM (.mts)', file: 'esm.mts', args: ['--module', 'node16', '--moduleResolution', 'node16'] },
    { name: 'node16 CJS (.cts)', file: 'cjs.cts', args: ['--module', 'node16', '--moduleResolution', 'node16'] },
    { name: 'nodenext CJS (.cts)', file: 'cjs.cts', args: ['--module', 'nodenext', '--moduleResolution', 'nodenext'] },
    { name: 'bundler', file: 'bundler.ts', args: ['--module', 'esnext', '--moduleResolution', 'bundler'] },
    { name: 'node10 (legacy main/types)', file: 'legacy.ts', args: ['--module', 'commonjs', '--moduleResolution', 'node10'] },
  ];
  for (const mode of modes) {
    writeFileSync(join(consumer, mode.file), source);
    check(`types: ${mode.name}`, () => {
      node([tscBin, '--noEmit', '--strict', '--target', 'es2020', ...mode.args, mode.file], consumer);
      return 'resolves and type-checks';
    });
  }
} finally {
  rmSync(work, { recursive: true, force: true, maxRetries: 5 }); // retries Windows EBUSY/EPERM locks
}

const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.detail}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\nverify-package: ${failed} check(s) failed` : '\nverify-package: all checks passed');
process.exit(failed ? 1 : 0);
