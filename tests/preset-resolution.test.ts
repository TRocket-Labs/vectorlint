import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { resolvePresetsDir } from '../src/cli/preset-resolution.js';

describe('resolvePresetsDir', () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  function setupTree(structure: Record<string, string>) {
    tempDir = mkdtempSync(path.join(tmpdir(), 'preset-resolution-'));
    for (const [relativePath, content] of Object.entries(structure)) {
      const fullPath = path.join(tempDir, relativePath);
      mkdirSync(path.dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content);
    }
    return tempDir;
  }

  it('uses the nearest presets directory when invoked from src/cli', () => {
    const root = setupTree({
      'src/presets/meta.json': JSON.stringify({ presets: {} }),
    });

    const resolved = resolvePresetsDir(path.join(root, 'src', 'cli'));

    expect(resolved).toBe(path.join(root, 'src', 'presets'));
  });

  it('falls back to the project presets directory when src/presets is missing', () => {
    const root = setupTree({
      'presets/meta.json': JSON.stringify({ presets: {} }),
    });

    const resolved = resolvePresetsDir(path.join(root, 'src', 'cli'));

    expect(resolved).toBe(path.join(root, 'presets'));
  });

  it('resolves the project presets directory when invoked from dist/cli', () => {
    const root = setupTree({
      'presets/meta.json': JSON.stringify({ presets: {} }),
    });

    const resolved = resolvePresetsDir(path.join(root, 'dist', 'cli'));

    expect(resolved).toBe(path.join(root, 'presets'));
  });

  it('throws when neither candidate contains meta.json', () => {
    const root = setupTree({});

    expect(() => resolvePresetsDir(path.join(root, 'src', 'cli'))).toThrow(
      `Could not locate presets directory containing meta.json. Looked in ${path.join(root, 'src', 'presets')} and ${path.join(root, 'presets')}`
    );
  });

  it('is importable from both CLI command modules', async () => {
    await import('../src/cli/commands.js');
    await import('../src/cli/validate-command.js');

    expect(true).toBe(true);
  }, 30000);
});
