import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import * as path from 'path';
import { createListDirectoryTool } from '../../src/agent/tools/list-directory';

const TMP = path.join(process.cwd(), 'tmp-list-dir-test');

beforeEach(() => {
  mkdirSync(path.join(TMP, 'subdir'), { recursive: true });
  writeFileSync(path.join(TMP, 'file.md'), '');
  writeFileSync(path.join(TMP, '.hidden'), '');
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('createListDirectoryTool', () => {
  it('lists files and directories', async () => {
    const tool = createListDirectoryTool(TMP);
    const result = await tool.execute({});
    expect(result).toContain('file.md');
    expect(result).toContain('subdir/');
  });

  it('appends / to directories', async () => {
    const tool = createListDirectoryTool(TMP);
    const result = await tool.execute({});
    expect(result).toContain('subdir/');
    expect(result).not.toContain('file.md/');
  });

  it('includes dotfiles', async () => {
    const tool = createListDirectoryTool(TMP);
    const result = await tool.execute({});
    expect(result).toContain('.hidden');
  });

  it('lists a specific subdirectory', async () => {
    writeFileSync(path.join(TMP, 'subdir', 'nested.md'), '');
    const tool = createListDirectoryTool(TMP);
    const result = await tool.execute({ path: 'subdir' });
    expect(result).toContain('nested.md');
    expect(result).not.toContain('file.md');
  });

  it('throws for paths outside root', async () => {
    const tool = createListDirectoryTool(TMP);
    await expect(tool.execute({ path: '../outside' })).rejects.toThrow();
  });

  it('shows truncation hint when entries exceed limit', async () => {
    writeFileSync(path.join(TMP, 'another.md'), '');
    const tool = createListDirectoryTool(TMP);
    const result = await tool.execute({ limit: 1 });
    expect(result).toContain('[1 entries limit reached. Use limit=2 for more.]');
  });

  it('does not show truncation hint when entries are within limit', async () => {
    const tool = createListDirectoryTool(TMP);
    const result = await tool.execute({ limit: 10 });
    expect(result).not.toContain('entries limit reached');
  });
});
