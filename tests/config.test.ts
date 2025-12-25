import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { loadConfig } from '../src/config/config.js';
import { DEFAULT_CONFIG_FILENAME, LEGACY_CONFIG_FILENAME } from '../src/config/constants.js';

describe('Config (.vectorlint.ini)', () => {
  it('errors when config file is missing', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'vlint-'));
    expect(() => loadConfig(cwd)).toThrow(/\.vectorlint\.ini.*vectorlint\.ini/i);
  });

  it('loads .vectorlint.ini (hidden file) when present', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'vlint-'));
    const ini = `
                RulesPath = hidden-prompts
                [*.md]
                RunRules=VectorLint
                `;
    writeFileSync(path.join(cwd, DEFAULT_CONFIG_FILENAME), ini);
    const cfg = loadConfig(cwd);
    expect(cfg.rulesPath).toMatch(/hidden-prompts$/);
  });

  it('falls back to vectorlint.ini when hidden file is absent', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'vlint-'));
    const ini = `
                RulesPath = fallback-prompts
                [*.md]
                RunRules=VectorLint
                `;
    writeFileSync(path.join(cwd, LEGACY_CONFIG_FILENAME), ini);
    const cfg = loadConfig(cwd);
    expect(cfg.rulesPath).toMatch(/fallback-prompts$/);
  });

  it('hidden file takes precedence when both exist', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'vlint-'));
    const hiddenIni = `
                RulesPath = hidden-rules
                [*.md]
                RunRules=VectorLint
                `;
    const visibleIni = `
                RulesPath = visible-rules
                [*.md]
                RunRules=VectorLint
                `;
    writeFileSync(path.join(cwd, DEFAULT_CONFIG_FILENAME), hiddenIni);
    writeFileSync(path.join(cwd, LEGACY_CONFIG_FILENAME), visibleIni);
    const cfg = loadConfig(cwd);
    expect(cfg.rulesPath).toMatch(/hidden-rules$/);
  });

  it('parses RulesPath and ScanPaths (PascalCase) and trims values', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'vlint-'));
    const ini = `
RulesPath = prompts
[*.md]
RunRules=VectorLint
[notes/**/*.txt]
RunRules=VectorLint
[docs/*.md]
RunRules=VectorLint
[README.md]
RunRules=VectorLint
`;
    writeFileSync(path.join(cwd, DEFAULT_CONFIG_FILENAME), ini);
    const cfg = loadConfig(cwd);
    expect(cfg.rulesPath).toMatch(/prompts$/);
    expect(cfg.scanPaths).toHaveLength(4);
    expect(cfg.scanPaths.map(s => s.pattern)).toEqual([
      '*.md',
      'notes/**/*.txt',
      'docs/*.md',
      'README.md',
    ]);
  });

  it('rejects old ScanPaths syntax', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'vlint-'));
    const ini = `RulesPath=prompts\nScanPaths=[src/**/*.js]\n`;
    writeFileSync(path.join(cwd, DEFAULT_CONFIG_FILENAME), ini);
    expect(() => loadConfig(cwd)).toThrow(/Old ScanPaths=\[\.\.\.\] syntax no longer supported/i);
  });
});
