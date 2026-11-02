// Copyright 2025 Metrc, LLC
// SPDX-License-Identifier: MIT
//
// QR bundle invariance gate.
//
// Builds the QR SDK twice with the SAME installed toolchain (this package's
// node_modules, pinned by package-lock.json):
//
//   * baseline: the javascript/ directory of a git ref (default: upstream/main),
//     written to a temporary directory straight from git's object store;
//   * current:  this working tree.
//
// It then checks that:
//   1. dist/retailid.min.js, dist/retailid.esm.js and dist/retailid.cjs are
//      byte-identical;
//   2. the QR type declarations are identical in content;
//   3. the IIFE, ESM and CJS bundles expose exactly the nine public QR exports;
//   4. the browser/CDN bundle contains no API-client, auth, fetch or Node code.
//
// Usage: npm run verify:qr-bundle [-- --baseline <git-ref>]
//    or: node scripts/verify-qr-bundle.mjs --baseline <git-ref>
// Nothing outside a temporary directory is written except this package's dist/.
//
// Cross-platform: no shell and no tar. The baseline is read with git plumbing,
// so it is the exact repository content regardless of core.autocrlf. (Line
// endings in sources do not affect the built bundles: TypeScript normalizes
// them. If a future toolchain became sensitive to them, this gate would report
// DIFFERENT, failing closed rather than passing.) The baseline reuses this
// package's node_modules through a directory junction on Windows, which needs
// no administrator rights or Developer Mode, and a symlink elsewhere.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const packageDir = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const rollupBin = require.resolve('rollup/dist/bin/rollup');

const BUNDLES = ['dist/retailid.min.js', 'dist/retailid.esm.js', 'dist/retailid.cjs'];
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
// Content that must never reach the public browser/CDN bundle.
const FORBIDDEN_IN_BROWSER_BUNDLE = [
  { label: 'API client', pattern: /RetailIdClient/ },
  { label: 'Authorization header', pattern: /authorization/i },
  { label: 'Basic auth', pattern: /\bBasic\s/ },
  { label: 'fetch call', pattern: /\bfetch\s*\(/ },
  { label: 'node: import', pattern: /\bnode:/ },
  { label: 'require()', pattern: /\brequire\s*\(/ },
  { label: 'process global', pattern: /\bprocess\./ },
];

const args = process.argv.slice(2);
const baselineFlag = args.indexOf('--baseline');
const baselineRef = baselineFlag >= 0 ? args[baselineFlag + 1] : 'upstream/main';
if (!baselineRef) {
  console.error('verify-qr-bundle: --baseline requires a git ref');
  process.exit(2);
}

const run = (command, commandArgs, cwd, options = {}) => {
  try {
    const stdin = options.input === undefined ? 'ignore' : 'pipe';
    return execFileSync(command, commandArgs, {
      cwd,
      stdio: [stdin, 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
      ...options,
    });
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
    throw new Error(`${command} ${commandArgs.join(' ')} failed${output ? `:\n${output}` : ''}`);
  }
};
const node = (nodeArgs, cwd) => run(process.execPath, nodeArgs, cwd);

// Writes the `subdir` tree of commit `sha` into `destination` using git plumbing:
// exact repository bytes, no archive format, no external tar, no EOL conversion.
const extractTree = (repo, sha, subdir, destination) => {
  const listing = run('git', ['ls-tree', '-r', '-z', '--full-tree', sha, '--', subdir], repo).toString('utf8');
  const entries = listing.split('\0').filter(Boolean).map((line) => {
    const tab = line.indexOf('\t');
    const [mode, type, object] = line.slice(0, tab).split(' ');
    return { mode, type, object, path: line.slice(tab + 1) };
  });
  if (!entries.length) throw new Error(`${subdir}/ does not exist at ${sha}`);
  const unsupported = entries.filter((e) => e.type !== 'blob' || e.mode === '120000');
  if (unsupported.length) {
    throw new Error(`baseline has entries that cannot be extracted as files: ${unsupported.map((e) => e.path).join(', ')}`);
  }
  const root = resolve(destination);
  const batch = run('git', ['cat-file', '--batch'], repo, {
    input: `${entries.map((e) => e.object).join('\n')}\n`,
  });
  let offset = 0;
  for (const entry of entries) {
    const headerEnd = batch.indexOf(0x0a, offset);
    const [object, type, size] = batch.subarray(offset, headerEnd).toString('utf8').split(' ');
    if (object !== entry.object || type !== 'blob') {
      throw new Error(`unexpected git cat-file output for ${entry.path}`);
    }
    const start = headerEnd + 1;
    const end = start + Number(size);
    const target = resolve(root, ...entry.path.split('/'));
    if (!target.startsWith(root + sep)) throw new Error(`refusing to write outside ${root}: ${entry.path}`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, batch.subarray(start, end));
    offset = end + 1; // git cat-file --batch terminates each object with LF
  }
  return entries.length;
};

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
// Read from disk: some packages do not export ./package.json.
const version = (name) =>
  JSON.parse(readFileSync(join(packageDir, 'node_modules', name, 'package.json'), 'utf8')).version;

// Public export names, loaded the way each consumer type loads them.
const iifeExports = (file) => {
  const context = vm.createContext({ crypto: globalThis.crypto, atob, btoa, console });
  vm.runInContext(readFileSync(file, 'utf8'), context, { filename: file });
  return Object.keys(context.RetailId ?? {}).sort();
};
const cjsExports = (file) =>
  Object.keys(createRequire(file)(file)).filter((k) => k !== '__esModule').sort();
const esmExports = async (file) =>
  Object.keys(await import(`${pathToFileURL(file).href}?t=${Date.now()}`)).sort();
const surface = async (root) => ({
  iife: iifeExports(join(root, 'dist/retailid.min.js')),
  esm: await esmExports(join(root, 'dist/retailid.esm.js')),
  cjs: cjsExports(join(root, 'dist/retailid.cjs')),
});
// The baseline emits its declaration at dist/src/index.d.ts (the bug PR-0
// fixes); the current tree emits dist/index.d.ts. Compare content, not path.
const declarationPath = (root) =>
  [join(root, 'dist/index.d.ts'), join(root, 'dist/src/index.d.ts')].find((p) => existsSync(p));

const failures = [];
const expect = (ok, message) => {
  if (!ok) failures.push(message);
  return ok;
};

const repoRoot = run('git', ['rev-parse', '--show-toplevel'], packageDir).toString().trim();
let baselineSha;
try {
  baselineSha = run('git', ['rev-parse', '--verify', `${baselineRef}^{commit}`], repoRoot).toString().trim();
} catch {
  console.error(`verify-qr-bundle: unknown git ref '${baselineRef}'. ` +
    'Fetch it (git fetch upstream) or pass --baseline <ref>.');
  process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), 'retailid-qr-baseline-'));
const baselineDir = join(work, 'javascript');
const baselineModules = join(baselineDir, 'node_modules');
try {
  // Baseline: extract javascript/ from the ref and build it with our node_modules.
  extractTree(repoRoot, baselineSha, 'javascript', work);
  symlinkSync(
    join(packageDir, 'node_modules'),
    baselineModules,
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  node([rollupBin, '-c'], baselineDir);

  // Current: rebuild this working tree's bundles with the same toolchain.
  node([rollupBin, '-c'], packageDir);

  console.log(`Baseline ref : ${baselineRef} (${baselineSha})`);
  console.log(`Toolchain    : typescript ${version('typescript')}, rollup ${version('rollup')}, ` +
    `terser ${version('terser')}, @rollup/plugin-typescript ${version('@rollup/plugin-typescript')}, ` +
    `node ${process.versions.node}\n`);

  console.log('1. Bundle bytes (SHA-256)');
  for (const bundle of BUNDLES) {
    const before = sha256(join(baselineDir, bundle));
    const after = sha256(join(packageDir, bundle));
    const same = expect(before === after, `${bundle} differs from baseline`);
    console.log(`   ${same ? 'IDENTICAL' : 'DIFFERENT'}  ${bundle}`);
    console.log(`     baseline ${before}`);
    console.log(`     current  ${after}`);
  }

  console.log('\n2. QR type declarations (content)');
  const baselineDecl = declarationPath(baselineDir);
  const currentDecl = declarationPath(packageDir);
  const declSame = expect(
    Boolean(baselineDecl && currentDecl) &&
      readFileSync(baselineDecl, 'utf8') === readFileSync(currentDecl, 'utf8'),
    'type declarations differ from baseline',
  );
  console.log(`   ${declSame ? 'IDENTICAL' : 'DIFFERENT'}  ` +
    `${baselineDecl ? relative(baselineDir, baselineDecl) : 'missing'} (baseline) vs ` +
    `${currentDecl ? relative(packageDir, currentDecl) : 'missing'} (current)`);

  console.log('\n3. Public export surface');
  const baselineSurface = await surface(baselineDir);
  const currentSurface = await surface(packageDir);
  for (const format of ['iife', 'esm', 'cjs']) {
    const names = currentSurface[format];
    const matchesExpected = JSON.stringify(names) === JSON.stringify(EXPECTED_EXPORTS);
    const matchesBaseline = JSON.stringify(names) === JSON.stringify(baselineSurface[format]);
    expect(matchesExpected && matchesBaseline, `${format} exports changed: ${names.join(', ')}`);
    console.log(`   ${matchesExpected && matchesBaseline ? 'UNCHANGED' : 'CHANGED  '}  ` +
      `${format.toUpperCase().padEnd(4)} ${names.length} exports: ${names.join(', ')}`);
  }

  console.log('\n4. Browser/CDN bundle content (dist/retailid.min.js)');
  const browserBundle = readFileSync(join(packageDir, 'dist/retailid.min.js'), 'utf8');
  for (const { label, pattern } of FORBIDDEN_IN_BROWSER_BUNDLE) {
    const clean = expect(!pattern.test(browserBundle), `browser bundle contains ${label}`);
    console.log(`   ${clean ? 'ABSENT ' : 'PRESENT'}  ${label}`);
  }
} finally {
  // Remove the link itself before deleting the temporary directory, and only
  // delete recursively once the link is confirmed gone, so cleanup can never
  // descend into the real node_modules the link points at.
  const linkGone = () => {
    try {
      lstatSync(baselineModules);
      return false;
    } catch {
      return true;
    }
  };
  if (!linkGone()) {
    try {
      unlinkSync(baselineModules); // removes a symlink, or a junction on Windows
    } catch {
      // Checked below.
    }
  }
  if (linkGone()) {
    rmSync(work, { recursive: true, force: true, maxRetries: 5 }); // retries Windows EBUSY/EPERM locks
  } else {
    console.warn(`verify-qr-bundle: could not remove the node_modules link; left ${work} in place.`);
  }
}

if (failures.length) {
  console.error(`\nverify-qr-bundle: FAILED\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log('\nverify-qr-bundle: PASSED — QR outputs are byte-identical to the baseline');
