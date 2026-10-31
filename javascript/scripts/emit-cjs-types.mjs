// Copyright 2025 Metrc, LLC
// SPDX-License-Identifier: MIT
//
// Emits CommonJS-flavoured declaration files (.d.cts) next to the .d.ts files.
//
// The package is "type": "module", so TypeScript reads .d.ts files as ESM
// typings. CommonJS consumers resolving the "require" export condition under
// module=node16 then fail with TS1479. A .d.cts copy gives the require
// condition CommonJS-flavoured typings for the same declarations.
//
//   dist/index.d.ts          -> dist/index.d.cts (QR SDK; must contain no
//                               relative module specifiers — copied verbatim)
//   dist/api/**/*.d.ts       -> *.d.cts, relative specifiers './x.js' rewritten
//   dist/node/**/*.d.ts         to './x.cjs' so they resolve to the .d.cts files
//
// Any relative specifier that does not end in '.js' is refused rather than
// guessed at.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const fail = (message) => {
  console.error(`emit-cjs-types: ${message}`);
  process.exit(1);
};

// Matches `from '...'`, `import('...')` and `import '...'` specifiers.
const SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"]+)\2/g;

// 1. QR declarations: verbatim copy, refusing relative specifiers (unchanged behaviour).
const qrSource = join(dist, 'index.d.ts');
if (!existsSync(qrSource)) fail(`${qrSource} not found; run rollup first.`);
const qr = readFileSync(qrSource, 'utf8');
for (const [, , , specifier] of qr.matchAll(SPECIFIER)) {
  if (specifier.startsWith('.')) {
    fail('dist/index.d.ts contains relative module specifiers; a plain copy to .d.cts would resolve them incorrectly.');
  }
}
writeFileSync(join(dist, 'index.d.cts'), qr);
let written = 1;

// 2. API and Node entry declarations: rewrite relative '.js' specifiers to '.cjs'.
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
for (const tree of ['api', 'node']) {
  const root = join(dist, tree);
  if (!existsSync(join(root, 'index.d.ts'))) fail(`${join(root, 'index.d.ts')} not found; run tsc first.`);
  for (const file of walk(root).filter((f) => f.endsWith('.d.ts'))) {
    const source = readFileSync(file, 'utf8');
    const rewritten = source.replace(SPECIFIER, (match, lead, quote, specifier) => {
      if (!specifier.startsWith('.')) return match;
      if (!specifier.endsWith('.js')) fail(`${file}: relative specifier '${specifier}' does not end in .js`);
      return `${lead}${quote}${specifier.slice(0, -'.js'.length)}.cjs${quote}`;
    });
    writeFileSync(file.replace(/\.d\.ts$/, '.d.cts'), rewritten);
    written += 1;
  }
}
console.log(`emit-cjs-types: wrote ${written} .d.cts file(s)`);
