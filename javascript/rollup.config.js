import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

const terserPlugin = terser({
  format: {
    max_line_len: 150,
  },
});

// Browser IIFE bundle
const browserConfig = {
  input: 'src/index.ts',
  output: {
    file: 'dist/retailid.min.js',
    format: 'iife',
    name: 'RetailId',
    exports: 'named',
    strict: true,
    sourcemap: true,
  },
  plugins: [
    resolve({ browser: true }),
    commonjs(),
    typescript({ tsconfig: './tsconfig.build.json' }),
    terserPlugin,
  ],
};

// Node.js ESM bundle
const esmConfig = {
  input: 'src/index.ts',
  output: {
    file: 'dist/retailid.esm.js',
    format: 'es',
    exports: 'named',
    sourcemap: true,
  },
  plugins: [
    resolve({ preferBuiltins: true }),
    commonjs(),
    typescript({ tsconfig: './tsconfig.build.json', declaration: false }),
  ],
};

// Node.js CommonJS bundle
const cjsConfig = {
  input: 'src/index.ts',
  output: {
    file: 'dist/retailid.cjs',
    format: 'cjs',
    exports: 'named',
    sourcemap: true,
  },
  plugins: [
    resolve({ preferBuiltins: true }),
    commonjs(),
    typescript({ tsconfig: './tsconfig.build.json', declaration: false }),
  ],
};

// Retail ID API client: @metrc/retailid/api and @metrc/retailid/node.
// Server-side only, so these are NOT part of the browser IIFE above. Both
// entries are built together so node/index imports the api/index chunk
// instead of inlining a second copy (one class identity across entry points).
const apiConfig = (format, extension) => ({
  input: {
    'api/index': 'src/api/index.ts',
    'node/index': 'src/node/index.ts',
  },
  external: (id) => id.startsWith('node:'),
  output: {
    dir: 'dist',
    format,
    exports: 'named',
    sourcemap: true,
    entryFileNames: `[name].${extension}`,
    chunkFileNames: `api/chunk-[hash].${extension}`,
  },
  plugins: [
    typescript({
      tsconfig: './tsconfig.api.json',
      declaration: false,
      declarationMap: false,
      outDir: 'dist',
    }),
  ],
});

export default [browserConfig, esmConfig, cjsConfig, apiConfig('es', 'js'), apiConfig('cjs', 'cjs')];
