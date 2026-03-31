import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { registerMainCommand } from '../../src/cli/commands';

describe('agent bootstrap', () => {
  it('imports agent runtime entrypoints from src/agent without module-not-found', async () => {
    await expect(import('../../src/agent/index')).resolves.toBeTruthy();
  });

  it('agent mode command path resolves using local runtime modules', () => {
    const program = new Command();
    registerMainCommand(program);

    const modeOption = program.options.find((option) => option.long === '--mode');
    expect(modeOption).toBeDefined();
  });
});
