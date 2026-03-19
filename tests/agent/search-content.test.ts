import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import * as path from 'path';
import { createSearchContentTool } from '../../src/agent/tools/search-content';

const TMP = path.join(process.cwd(), 'tmp-search-content-test');

beforeEach(() => {
  mkdirSync(path.join(TMP, 'pages'), { recursive: true });
  writeFileSync(path.join(TMP, 'pages', 'a.md'), 'API key is required\nUse your API key here\n');
  writeFileSync(path.join(TMP, 'pages', 'b.md'), 'access token must be provided\n');
  writeFileSync(path.join(TMP, 'pages', 'c.md'), 'No relevant content\n');
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('createSearchContentTool', () => {
  it('finds pattern across files with file:line: format', async () => {
    const tool = createSearchContentTool(TMP);
    const result = await tool.execute({ pattern: 'API key' });
    expect(result).toMatch(/a\.md:\d+:/);
    expect(result).toContain('API key');
  });

  it('returns no matches message when nothing found', async () => {
    const tool = createSearchContentTool(TMP);
    const result = await tool.execute({ pattern: 'xyznotfound' });
    expect(result).toContain('No matches found');
  });

  it('supports case-insensitive search', async () => {
    const tool = createSearchContentTool(TMP);
    const result = await tool.execute({ pattern: 'api key', ignoreCase: true });
    expect(result).toContain('API key');
  });

  it('filters by glob pattern', async () => {
    writeFileSync(path.join(TMP, 'pages', 'skip.ts'), 'API key = process.env.KEY');
    const tool = createSearchContentTool(TMP);
    const result = await tool.execute({ pattern: 'API key', glob: '*.md' });
    expect(result).not.toContain('skip.ts');
  });
});
