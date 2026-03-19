import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import * as path from 'node:path';
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
    mkdirSync(path.join(TMP, 'subdir'), { recursive: true });
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
});
