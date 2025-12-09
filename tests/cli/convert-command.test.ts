import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerConvertCommand } from '../../src/cli/convert-command';
import * as fs from 'fs';

// Mocks
vi.mock('fs');
vi.mock('../../src/style-guide/style-guide-processor');
vi.mock('../../src/providers/provider-factory');
vi.mock('../../src/boundaries/index');
vi.mock('../../src/prompts/directive-loader');

describe('convert command', () => {
    let program: Command;

    beforeEach(() => {
        program = new Command();
        vi.clearAllMocks();
        // Mock fs.existsSync to return true for style guide
        vi.mocked(fs.existsSync).mockReturnValue(true);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should register convert command', () => {
        registerConvertCommand(program);
        const command = program.commands.find(c => c.name() === 'convert');
        expect(command).toBeDefined();
        expect(command?.description()).toContain('Convert a style guide');
    });

    it('should have correct options', () => {
        registerConvertCommand(program);
        const command = program.commands.find(c => c.name() === 'convert');
        const options = command?.options.map(o => o.name());

        expect(options).toContain('output');
        expect(options).toContain('format');
        expect(options).toContain('template');
        expect(options).toContain('strictness');
        expect(options).toContain('severity');
        expect(options).toContain('force');
        expect(options).toContain('dry-run');
        expect(options).toContain('verbose');
    });
});
