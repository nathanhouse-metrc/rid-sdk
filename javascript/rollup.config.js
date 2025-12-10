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
    typescript({ tsconfig: './tsconfig.json' }),
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
    typescript({ tsconfig: './tsconfig.json', declaration: false }),
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
    typescript({ tsconfig: './tsconfig.json', declaration: false }),
  ],
};

export default [browserConfig, esmConfig, cjsConfig];
