import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { loadConfig } from '../src/config/config.js';

describe('Config (vectorlint.ini)', () => {
  it('errors when config file is missing', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'vlint-'));
    expect(() => loadConfig(cwd)).toThrow(/vectorlint\.ini/i);
  });

  it('parses PromptsPath and ScanPaths (PascalCase) and trims values', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'vlint-'));
    const ini = `\n  PromptsPath = prompts \n  ScanPaths = [ *.md , notes/**/*.txt , docs/*.md , README.md ] \n`;
    writeFileSync(path.join(cwd, 'vectorlint.ini'), ini);
    const cfg = loadConfig(cwd);
    expect(cfg.promptsPath).toMatch(/prompts$/);
    expect(cfg.scanPaths).toEqual([
      '*.md',
      'notes/**/*.txt',
      'docs/*.md',
      'README.md',
    ]);
  });

  it('rejects unsupported extensions in ScanPaths', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'vlint-'));
    const ini = `PromptsPath=prompts\nScanPaths=[src/**/*.js]\n`;
    writeFileSync(path.join(cwd, 'vectorlint.ini'), ini);
    expect(() => loadConfig(cwd)).toThrow(/Only .md and .txt are supported/i);
  });
});

