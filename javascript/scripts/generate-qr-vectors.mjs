// Copyright 2025 Metrc, LLC
// SPDX-License-Identifier: MIT
//
// Generates ../test-vectors/qr-vectors.json, the canonical, version-controlled
// expected outputs for Retail ID QR encoding and decoding.
//
// The JavaScript SDK is the reference implementation, so every expected value
// is produced by the built SDK itself (`dist/retailid.esm.js`, the file the
// package's `import` export points at). Nothing is derived from Python, Java
// or Dart.
//
// Usage (from the `javascript/` directory):
//
//   npm run build                                  # prerequisite: creates dist/
//   node scripts/generate-qr-vectors.mjs           # (re)write the fixture
//   node scripts/generate-qr-vectors.mjs --check   # report whether the committed
//                                                  # fixture is current; writes nothing
//
// This script is deliberately NOT part of `npm run build` or `npm test`. The
// committed JSON holds fixed expected values; tests read it and never
// regenerate it, so an encoder regression fails a test instead of silently
// updating the expectations. Regenerate only on purpose, then review the diff.
//
// The output is deterministic: fixed ordering, no timestamps and no
// machine-specific values.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(scriptDir, '../dist/retailid.esm.js');
const fixturePath = resolve(scriptDir, '../../test-vectors/qr-vectors.json');

const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--check')) {
  console.error('Usage: node scripts/generate-qr-vectors.mjs [--check]');
  process.exit(2);
}
const checkOnly = args.includes('--check');

if (!existsSync(bundlePath)) {
  console.error(`Missing ${bundlePath}.\nBuild the SDK first: npm run build`);
  process.exit(2);
}
const sdk = await import(pathToFileURL(bundlePath).href);

const DEFAULT_DOMAIN = '1a4.com';
const MAX_INDEX_EXCLUSIVE = 2 ** 31; // larger indexes are intentionally excluded

// Index values at which the LEB128 varint grows by one byte (and the value just before).
const VARINT_BOUNDARIES = new Set([1, 127, 128, 16383, 16384, 2097151, 2097152]);

const BATCHES = [
  {
    id: 'knownPrefixAbc',
    batchId: 'abcdef012345670000027190',
    category: 'known-prefix',
    description: "Known RetailID prefix 'abc'.",
  },
  {
    id: 'knownPrefix1a4',
    batchId: '1a4060300020081000006609',
    category: 'known-prefix',
    description: "Known RetailID prefix '1a4'.",
  },
  {
    id: 'knownPrefix1a4Alt',
    batchId: '1a40603000041b6000009297',
    category: 'known-prefix',
    description: "Second batch with the known RetailID prefix '1a4'.",
  },
  {
    id: 'validTimestampNoPrefix',
    batchId: '507f1f77bcf86cd799439011',
    category: 'valid-timestamp-no-prefix',
    description: 'No RetailID prefix, but a valid ObjectId timestamp (2012-10-17).',
  },
  {
    id: 'invalidTimestampNoPrefix',
    batchId: 'ffffffffffffffffffffffff',
    category: 'invalid-timestamp-no-prefix',
    description: 'No RetailID prefix and an invalid ObjectId timestamp. Used only for strict-mode rejection.',
  },
];

const PREFIX_INDEXES = [0, 1, 127, 128, 248, 249, 16383, 16384, 2097151, 2097152];
const NO_PREFIX_INDEXES = [1, 128, 16384, 2097152];
const STRICT_REJECTION_INDEXES = [1, 16383];
const CUSTOM_DOMAIN = { batch: 'knownPrefixAbc', index: 16383, domain: 'example.com' };
const INVALID_INPUTS = ['invalid_garbage', 'invalid-garbage', 'not a url at all', 'https://1a4.com/!!!', 'ZZZZ'];

const batchById = new Map(BATCHES.map((batch) => [batch.id, batch]));

function fail(message) {
  console.error(`generate-qr-vectors: ${message}`);
  process.exit(1);
}

function shortCode(url) {
  return url.slice(url.lastIndexOf('/') + 1);
}

function decodes(input, strict) {
  try {
    const pair = new sdk.RetailIdPair(input, strict);
    return { batchId: pair.batchId.toHexString().toLowerCase(), index: pair.index };
  } catch {
    return null;
  }
}

function assertRoundTrip(label, inputs, strict) {
  for (const input of inputs) {
    const result = decodes(input, strict);
    if (!result || result.batchId !== label.batchId || result.index !== label.index) {
      fail(`${label.id}: '${input}' did not decode to its own batch/index (strict=${strict})`);
    }
  }
}

function buildLabel(batch, index) {
  if (!Number.isInteger(index) || index < 0 || index >= MAX_INDEX_EXCLUSIVE) {
    fail(`${batch.id}: index ${index} is outside the supported range [0, 2^31)`);
  }
  const objectId = new sdk.ObjectId(batch.batchId);
  const base36Url = sdk.getShortUrl(objectId, index, {});
  const base64Url = sdk.getShortUrl(objectId, index, { base64: true });
  if (!base36Url.startsWith(`HTTPS://${DEFAULT_DOMAIN.toUpperCase()}/`)) fail(`unexpected Base36 URL ${base36Url}`);
  if (!base64Url.startsWith(`https://${DEFAULT_DOMAIN}/`)) fail(`unexpected Base64 URL ${base64Url}`);

  const label = {
    id: `${batch.id}-${index}`,
    batch: batch.id,
    batchId: batch.batchId,
    index,
    varintBytes: sdk.VarInt.encode(index).length,
    base36Code: shortCode(base36Url),
    base64Code: shortCode(base64Url),
    tags: [],
  };
  if (index === 0) label.tags.push('index-zero');
  if (VARINT_BOUNDARIES.has(index)) label.tags.push('varint-boundary');
  if (label.base64Code.includes('-')) label.tags.push('base64-hyphen');
  if (label.base64Code.includes('_')) label.tags.push('base64-underscore');

  // Generation-time self-check: the SDK must decode what it just encoded, in
  // both modes and from either form, so an inconsistent fixture is never written.
  for (const strict of [false, true]) {
    assertRoundTrip(label, [base36Url, base64Url, label.base36Code, label.base64Code], strict);
  }
  return label;
}

const labels = [];
for (const batch of BATCHES) {
  if (batch.category === 'invalid-timestamp-no-prefix') continue;
  const indexes = batch.category === 'known-prefix' ? PREFIX_INDEXES : NO_PREFIX_INDEXES;
  for (const index of indexes) labels.push(buildLabel(batch, index));
}

const strictRejections = [];
for (const index of STRICT_REJECTION_INDEXES) {
  const batch = batchById.get('invalidTimestampNoPrefix');
  const objectId = new sdk.ObjectId(batch.batchId);
  const base36Url = sdk.getShortUrl(objectId, index, {});
  const base64Url = sdk.getShortUrl(objectId, index, { base64: true });
  const entry = {
    id: `${batch.id}-${index}`,
    batch: batch.id,
    batchId: batch.batchId,
    index,
    base36Code: shortCode(base36Url),
    base64Code: shortCode(base64Url),
  };
  for (const input of [base36Url, base64Url, entry.base36Code, entry.base64Code]) {
    if (decodes(input, true) !== null) fail(`${entry.id}: strict mode unexpectedly accepted '${input}'`);
  }
  strictRejections.push(entry);
}

const customBatch = batchById.get(CUSTOM_DOMAIN.batch);
const customObjectId = new sdk.ObjectId(customBatch.batchId);
const customLabel = labels.find((l) => l.batch === CUSTOM_DOMAIN.batch && l.index === CUSTOM_DOMAIN.index);
const customDomain = {
  id: `${customLabel.id}@${CUSTOM_DOMAIN.domain}`,
  label: customLabel.id,
  domain: CUSTOM_DOMAIN.domain,
  base36Url: sdk.getShortUrl(customObjectId, CUSTOM_DOMAIN.index, { domain: CUSTOM_DOMAIN.domain }),
  base64Url: sdk.getShortUrl(customObjectId, CUSTOM_DOMAIN.index, { domain: CUSTOM_DOMAIN.domain, base64: true }),
};
if (!customDomain.base36Url.startsWith('HTTPS://EXAMPLE.COM/')) fail(`unexpected URL ${customDomain.base36Url}`);
if (!customDomain.base64Url.startsWith('https://example.com/')) fail(`unexpected URL ${customDomain.base64Url}`);
for (const strict of [false, true]) {
  assertRoundTrip(customLabel, [customDomain.base36Url, customDomain.base64Url], strict);
}

const invalidInputs = INVALID_INPUTS.map((input, i) => {
  for (const strict of [false, true]) {
    if (decodes(input, strict) !== null) fail(`invalid input '${input}' was unexpectedly accepted (strict=${strict})`);
  }
  return { id: `invalid-${i + 1}`, input };
});

const ids = [...labels, ...strictRejections, ...invalidInputs].map((entry) => entry.id);
if (new Set(ids).size !== ids.length) fail('duplicate case identifiers');

const fixture = {
  schemaVersion: 1,
  canonicalImplementation: 'javascript',
  generator: 'javascript/scripts/generate-qr-vectors.mjs',
  defaultDomain: DEFAULT_DOMAIN,
  conventions: {
    batchId: '24 lowercase hexadecimal characters. Compare case-insensitively: some SDKs render uppercase.',
    index: 'Non-negative integer below 2^31 (2147483648).',
    payload: 'The 12 batch ID bytes followed by the index as an unsigned LEB128 varint.',
    base36Code: 'The payload as a big-endian integer in uppercase Base36.',
    base64Code: "The payload as URL-safe Base64 ('+' becomes '-', '/' becomes '_') without '=' padding.",
    urls: 'Base36: HTTPS://<defaultDomain uppercased>/<base36Code>. Base64: https://<defaultDomain>/<base64Code>. The host never affects decoding, and a bare short code is also accepted.',
    labels: 'Each label must encode to exactly its base36Code and base64Code, and each form must decode to its batchId and index in both default and strict mode.',
    strictRejections: 'These labels must be rejected in strict mode (no known prefix and an invalid ObjectId timestamp). Default-mode behavior for them is intentionally not specified.',
    customDomain: 'Encoding with the given domain must produce exactly these URLs, and each must decode to the referenced label.',
    invalidInputs: 'Must be rejected in default and strict mode. Only the rejection is specified, not the error type or message.',
    intentionallyExcluded: [
      'indexes at or above 2^31',
      'lowercase Base36 short codes',
      'default-mode decoding of batches with an invalid ObjectId timestamp',
      'ObjectId timestamps after 2038-01-19',
      'negative, fractional or NaN indexes',
    ],
  },
  batches: BATCHES,
  labels,
  strictRejections,
  customDomain: [customDomain],
  invalidInputs,
};

const output = `${JSON.stringify(fixture, null, 2)}\n`;

if (checkOnly) {
  // Git may check the fixture out with CRLF line endings on Windows; compare content, not line endings.
  const current = existsSync(fixturePath) ? readFileSync(fixturePath, 'utf8').replace(/\r\n/g, '\n') : null;
  if (current === output) {
    console.log(`up to date: ${fixturePath}`);
    process.exit(0);
  }
  console.error(`out of date: ${fixturePath}\nRegenerate it with: node scripts/generate-qr-vectors.mjs`);
  process.exit(1);
}

mkdirSync(dirname(fixturePath), { recursive: true });
writeFileSync(fixturePath, output);
console.log(`wrote ${fixturePath} (${labels.length} labels, ${strictRejections.length} strict rejections, ${invalidInputs.length} invalid inputs)`);
