import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import * as path from 'path';
import { createSearchFilesTool } from '../../src/agent/tools/search-files';

const TMP = path.join(process.cwd(), 'tmp-search-files-test');

beforeEach(() => {
  mkdirSync(path.join(TMP, 'docs'), { recursive: true });
  writeFileSync(path.join(TMP, 'docs', 'quickstart.md'), '# Quickstart');
  writeFileSync(path.join(TMP, 'docs', 'api.md'), '# API');
  writeFileSync(path.join(TMP, 'docs', 'config.ts'), 'export const x = 1');
  writeFileSync(path.join(TMP, 'README.md'), '# Readme');
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('createSearchFilesTool', () => {
  it('finds files matching glob pattern', async () => {
    const tool = createSearchFilesTool(TMP);
    const result = await tool.execute({ pattern: '**/*.md' });
    expect(result).toContain('quickstart.md');
    expect(result).toContain('api.md');
    expect(result).toContain('README.md');
  });

  it('excludes non-matching files', async () => {
    const tool = createSearchFilesTool(TMP);
    const result = await tool.execute({ pattern: '**/*.md' });
    expect(result).not.toContain('config.ts');
  });

  it('scopes search to provided path', async () => {
    const tool = createSearchFilesTool(TMP);
    const result = await tool.execute({ pattern: '*.md', path: 'docs' });
    expect(result).toContain('docs/quickstart.md');
    expect(result).toContain('docs/api.md');
    expect(result).not.toContain('README.md');
  });

  it('returns no files found message when no matches', async () => {
    const tool = createSearchFilesTool(TMP);
    const result = await tool.execute({ pattern: '**/*.xyz' });
    expect(result).toContain('No files found');
  });

  it('respects repo-root .gitignore patterns', async () => {
    writeFileSync(path.join(TMP, '.gitignore'), 'docs/api.md\n');
    const tool = createSearchFilesTool(TMP);
    const result = await tool.execute({ pattern: '**/*.md' });
    expect(result).toContain('docs/quickstart.md');
    expect(result).not.toContain('docs/api.md');
  });
});
