import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import { createReadFileTool } from '../../src/agent/tools/read-file';

const TMP = path.join(process.cwd(), 'tmp-read-file-test');

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('createReadFileTool', () => {
  it('reads a file and returns text content', async () => {
    writeFileSync(path.join(TMP, 'test.md'), 'Hello world\nLine two\n');
    const tool = createReadFileTool(TMP);
    const result = await tool.execute({ path: 'test.md' });
    expect(result).toContain('Hello world');
    expect(result).toContain('Line two');
  });

  it('supports offset and limit for pagination', async () => {
    const lines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`).join('\n');
    writeFileSync(path.join(TMP, 'long.md'), lines);
    const tool = createReadFileTool(TMP);
    const result = await tool.execute({ path: 'long.md', offset: 3, limit: 2 });
    expect(result).toContain('Line 3');
    expect(result).toContain('Line 4');
    expect(result).not.toContain('Line 1');
    expect(result).not.toContain('Line 5');
  });

  it('throws for files outside cwd', async () => {
    const tool = createReadFileTool(TMP);
    await expect(tool.execute({ path: '../outside.md' })).rejects.toThrow();
  });

  it('returns actionable notice when file is truncated', async () => {
    const lines = Array.from({ length: 250 }, (_, i) => `Line ${i + 1}`).join('\n');
    writeFileSync(path.join(TMP, 'big.md'), lines);
    const tool = createReadFileTool(TMP);
    const result = await tool.execute({ path: 'big.md' });
    expect(result).toContain('Use offset=');
  });
});
