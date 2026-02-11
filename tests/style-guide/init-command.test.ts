import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { DEFAULT_CONFIG_FILENAME, USER_INSTRUCTION_FILENAME } from '../../src/config/constants';

// Mock the global config module
const MOCK_ENSURE_GLOBAL_CONFIG = vi.fn().mockReturnValue('/mock/home/.vectorlint/config.toml');

vi.mock('../../src/config/global-config', () => ({
    ensureGlobalConfig: MOCK_ENSURE_GLOBAL_CONFIG,
    getGlobalConfigPath: () => '/mock/home/.vectorlint/config.toml'
}));

describe('Init Command (Style Guide Support)', () => {
    let testDir: string;
    let originalCwd: string;

    beforeEach(() => {
        testDir = mkdtempSync(path.join(tmpdir(), 'vectorlint-init-style-'));
        originalCwd = process.cwd();
        process.chdir(testDir);
        vi.clearAllMocks();
    });

    afterEach(() => {
        process.chdir(originalCwd);
        rmSync(testDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it('default: creates only .vectorlint.ini (backward compatibility)', async () => {
        const { registerInitCommand } = await import('../../src/cli/init-command');
        const { Command } = await import('commander');

        const testProgram = new Command();
        registerInitCommand(testProgram);

        await testProgram.parseAsync(['node', 'test', 'init']);

        expect(existsSync(path.join(testDir, DEFAULT_CONFIG_FILENAME))).toBe(true);
        expect(existsSync(path.join(testDir, USER_INSTRUCTION_FILENAME))).toBe(false);
    });

    it('--quick: creates only VECTORLINT.md', async () => {
        const { registerInitCommand } = await import('../../src/cli/init-command');
        const { Command } = await import('commander');

        const testProgram = new Command();
        registerInitCommand(testProgram);

        await testProgram.parseAsync(['node', 'test', 'init', '--quick']);

        expect(existsSync(path.join(testDir, DEFAULT_CONFIG_FILENAME))).toBe(false);
        expect(existsSync(path.join(testDir, USER_INSTRUCTION_FILENAME))).toBe(true);

        const content = readFileSync(path.join(testDir, USER_INSTRUCTION_FILENAME), 'utf-8');
        expect(content).toContain('# User Instructions');
    });

    it('--full: creates both files', async () => {
        const { registerInitCommand } = await import('../../src/cli/init-command');
        const { Command } = await import('commander');

        const testProgram = new Command();
        registerInitCommand(testProgram);

        await testProgram.parseAsync(['node', 'test', 'init', '--full']);

        expect(existsSync(path.join(testDir, DEFAULT_CONFIG_FILENAME))).toBe(true);
        expect(existsSync(path.join(testDir, USER_INSTRUCTION_FILENAME))).toBe(true);
    });

    it('respects existing files without --force', async () => {
        // Create a pre-existing style guide
        writeFileSync(path.join(testDir, USER_INSTRUCTION_FILENAME), 'Original Content');

        const { registerInitCommand } = await import('../../src/cli/init-command');
        const { Command } = await import('commander');

        const testProgram = new Command();
        testProgram.exitOverride(); // Prevent process.exit()
        registerInitCommand(testProgram);

        // Try to run --quick (which wants to create USER_INSTRUCTION_FILENAME)
        // Should fail because it exists
        await expect(
            testProgram.parseAsync(['node', 'test', 'init', '--quick'])
        ).rejects.toThrow();

        expect(readFileSync(path.join(testDir, USER_INSTRUCTION_FILENAME), 'utf-8')).toBe('Original Content');
    });

    it('overwrites with --force', async () => {
        writeFileSync(path.join(testDir, USER_INSTRUCTION_FILENAME), 'Original Content');

        const { registerInitCommand } = await import('../../src/cli/init-command');
        const { Command } = await import('commander');

        const testProgram = new Command();
        registerInitCommand(testProgram);

        await testProgram.parseAsync(['node', 'test', 'init', '--quick', '--force']);

        const content = readFileSync(path.join(testDir, USER_INSTRUCTION_FILENAME), 'utf-8');
        expect(content).toContain('# User Instructions');
        expect(content).not.toBe('Original Content');
    });
});
