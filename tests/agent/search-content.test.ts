import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { createSearchContentTool } from '../../src/agent/tools/search-content';

let tmpDir = '';

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'vectorlint-search-content-'));
  mkdirSync(path.join(tmpDir, 'docs'), { recursive: true });
  writeFileSync(path.join(tmpDir, 'docs', 'a.md'), 'API key is required\nUse your API key here\n');
  writeFileSync(path.join(tmpDir, 'docs', 'b.md'), 'access token must be provided\n');
  writeFileSync(path.join(tmpDir, 'docs', 'c.md'), 'No relevant content\n');
});

afterEach(() => {
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('createSearchContentTool', () => {
  it('finds pattern across files with file:line: format', async () => {
    const tool = createSearchContentTool(tmpDir);
    const result = await tool.execute({ pattern: 'API key' });
    expect(result).toMatch(/a\.md:\d+:/);
    expect(result).toContain('API key');
  });

  it('returns no matches message when nothing found', async () => {
    const tool = createSearchContentTool(tmpDir);
    const result = await tool.execute({ pattern: 'xyznotfound' });
    expect(result).toContain('No matches found');
  });

  it('supports case-insensitive search', async () => {
    const tool = createSearchContentTool(tmpDir);
    const result = await tool.execute({ pattern: 'api key', ignoreCase: true });
    expect(result).toContain('API key');
  });

  it('filters by glob pattern', async () => {
    writeFileSync(path.join(tmpDir, 'docs', 'skip.ts'), 'API key = process.env.KEY');
    const tool = createSearchContentTool(tmpDir);
    const result = await tool.execute({ pattern: 'API key', glob: '*.md' });
    expect(result).not.toContain('skip.ts');
  });
});
