import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PACKAGE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../package.json');

describe('package entrypoints', () => {
  it('keeps both published bin aliases pointed at the built CLI', () => {
    const packageJson = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8')) as {
      main?: string;
      bin?: Record<string, string>;
    };

    expect(packageJson.main).toBe('dist/index.js');
    expect(packageJson.bin).toEqual({
      vectorlint: './dist/index.js',
      veclint: './dist/index.js',
    });
  });
});
