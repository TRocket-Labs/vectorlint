import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { resolveTargets } from '../src/scan/file-resolver.js';

function setupTree(structure: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), 'vlint-'));
  for (const [rel, content] of Object.entries(structure)) {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

describe('FileResolver', () => {
  it('uses ScanPaths when no CLI args; excludes prompts subtree', () => {
    const root = setupTree({
      'prompts/a.md': '# p',
      'docs/one.md': 'x',
      'docs/two.txt': 'y',
      'notes/three.md': 'z',
    });
    const res = resolveTargets({
      cliArgs: [],
      cwd: root,
      rulesPath: path.join(root, 'prompts'),
      scanPaths: [
        { pattern: '**/*.md', overrides: {} }
      ],
      configDir: root,
    });
    expect(res.sort()).toEqual([
      path.join(root, 'docs/one.md'),
      path.join(root, 'notes/three.md'),
    ].sort());
  });

  it('CLI args override config; directories recurse; excludes prompts subtree', () => {
    const root = setupTree({
      'prompts/a.md': '# p',
      'articles/a.md': 'a',
      'articles/b.txt': 'b',
      'articles/sub/c.md': 'c',
      'misc/d.txt': 'd',
    });
    const res = resolveTargets({
      cliArgs: [path.join(root, 'articles')],
      cwd: root,
      rulesPath: path.join(root, 'prompts'),
      scanPaths: [
        { pattern: '*.md', overrides: {} }
      ],
      configDir: root,
    });
    expect(res.sort()).toEqual([
      path.join(root, 'articles/a.md'),
      path.join(root, 'articles/b.txt'),
      path.join(root, 'articles/sub/c.md'),
    ].sort());
  });

  it('filters by extension: supports .md and .txt only', () => {
    const root = setupTree({
      'prompts/a.md': '# p',
      'docs/one.md': 'x',
      'docs/two.txt': 'y',
      'docs/three.mdx': 'nope',
    });
    const res = resolveTargets({
      cliArgs: [],
      cwd: root,
      rulesPath: path.join(root, 'prompts'),
      scanPaths: [
        { pattern: 'docs/*md', overrides: {} },
        { pattern: 'docs/*.txt', overrides: {} }
      ],
      configDir: root,
    });
    expect(res.sort()).toEqual([
      path.join(root, 'docs/one.md'),
      path.join(root, 'docs/two.txt'),
    ].sort());
  });
});

