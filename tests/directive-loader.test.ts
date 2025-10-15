import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { loadDirective } from '../src/prompts/directive-loader.js';

describe('DirectiveLoader', () => {
  it('returns override from .vectorlint when present', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'vl-dir-'));
    const vl = path.join(root, '.vectorlint');
    mkdirSync(vl, { recursive: true });
    writeFileSync(path.join(vl, 'directive.md'), 'OVERRIDE');
    const d = loadDirective(root);
    expect(d).toBe('OVERRIDE');
  });

  it('returns built-in directive when no override exists', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'vl-dir-'));
    const d = loadDirective(root);
    // Default file shipped at src/prompts/directive.md has comments; should be non-null string
    expect(typeof d).toBe('string');
    // May be empty or comments; ensure function returns a string (possibly empty)
  });
});

