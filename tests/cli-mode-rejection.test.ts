import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

describe('CLI --mode rejection', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(
      ((code?: string | number | null) => {
        throw new Error(`exit:${code ?? ''}`);
      }) as never,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects --mode and points users at --model-call instead of mapping it', async () => {
    const { registerMainCommand } = await import('../src/cli/commands');
    const program = new Command();
    registerMainCommand(program);

    await expect(
      program.parseAsync(['node', 'test', 'README.md', '--mode', 'agent']),
    ).rejects.toThrow('exit:1');

    expect(vi.mocked(console.error)).toHaveBeenCalledWith(
      expect.stringContaining('--mode is no longer supported'),
    );
    expect(vi.mocked(console.error)).toHaveBeenCalledWith(
      expect.stringContaining('--model-call'),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
