// Copyright 2025 Metrc, LLC
// SPDX-License-Identifier: MIT
//
// Emits dist/index.d.cts next to dist/index.d.ts.
//
// The package is "type": "module", so TypeScript reads dist/index.d.ts as ESM
// typings. CommonJS consumers resolving the "require" export condition under
// module=node16 then fail with TS1479. A .d.cts copy gives the require
// condition CommonJS-flavoured typings for the same declarations.
//
// A byte-for-byte copy is only valid while the declarations contain no
// relative module specifiers (which would need .cjs/.d.cts rewriting), so this
// script refuses to run if any appear.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../dist/index.d.ts', import.meta.url));
const target = fileURLToPath(new URL('../dist/index.d.cts', import.meta.url));

let declarations;
try {
  declarations = readFileSync(source, 'utf8');
} catch {
  console.error(`emit-cjs-types: ${source} not found; run rollup first.`);
  process.exit(1);
}

const relativeSpecifier = /\b(?:from|import)\s*\(?\s*['"]\.{1,2}\//;
if (relativeSpecifier.test(declarations)) {
  console.error(
    'emit-cjs-types: dist/index.d.ts contains relative module specifiers; ' +
      'a plain copy to .d.cts would resolve them incorrectly. Update this script.',
  );
  process.exit(1);
}

writeFileSync(target, declarations);
console.log('emit-cjs-types: wrote dist/index.d.cts');
