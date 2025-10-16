import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  outDir: 'dist',
  splitting: false,
  bundle: true, // Bundle for CLI tool distribution
  external: [
    // All dependencies should be external for CLI tool
    'chalk',
    'commander',
    'fast-glob',
    'micromatch',
    'openai',
    'strip-ansi',
    'yaml',
    'zod'
  ]
});