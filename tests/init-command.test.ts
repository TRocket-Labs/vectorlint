import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { DEFAULT_CONFIG_FILENAME } from '../src/config/constants';

/**
 * Tests for the init command functionality.
 * 
 */
describe('Init Command', () => {
    let testDir: string;
    let originalCwd: string;

    beforeEach(() => {
        testDir = mkdtempSync(path.join(tmpdir(), 'vectorlint-init-'));
        originalCwd = process.cwd();
        process.chdir(testDir);
    });

    afterEach(() => {
        process.chdir(originalCwd);
        rmSync(testDir, { recursive: true, force: true });
    });

    describe('File Generation', () => {
        it(`creates ${DEFAULT_CONFIG_FILENAME} with correct template`, async () => {
            // Dynamically import to get fresh module
            const { registerInitCommand } = await import('../src/cli/init-command');
            const { program } = await import('commander');

            // Create a fresh program instance
            const testProgram = program.createCommand();
            registerInitCommand(testProgram);

            // Parse with init command
            await testProgram.parseAsync(['node', 'test', 'init']);

            const configPath = path.join(testDir, DEFAULT_CONFIG_FILENAME);
            expect(existsSync(configPath)).toBe(true);

            const content = readFileSync(configPath, 'utf-8');
            expect(content).toContain('# VectorLint Configuration');
            expect(content).toContain('RulesPath=');
            expect(content).toContain('Concurrency=4');
            expect(content).toContain('DefaultSeverity=warning');
            expect(content).toContain('[**/*.md]');
            expect(content).toContain('RunRules=VectorLint');
        });

        it('creates .env.vectorlint with correct template', async () => {
            const { registerInitCommand } = await import('../src/cli/init-command');
            const { program } = await import('commander');

            const testProgram = program.createCommand();
            registerInitCommand(testProgram);

            await testProgram.parseAsync(['node', 'test', 'init']);

            const envPath = path.join(testDir, '.env.vectorlint');
            expect(existsSync(envPath)).toBe(true);

            const content = readFileSync(envPath, 'utf-8');
            expect(content).toContain('# VectorLint Environment Configuration');
            expect(content).toContain('LLM_PROVIDER=azure-openai');
            expect(content).toContain('LLM_PROVIDER=anthropic');
            expect(content).toContain('AZURE_OPENAI_API_KEY');
            expect(content).toContain('ANTHROPIC_API_KEY');
            expect(content).toContain('PERPLEXITY_API_KEY');
        });
    });

    describe('Safety Checks', () => {
        it(`refuses to overwrite existing ${DEFAULT_CONFIG_FILENAME} without --force`, async () => {
            // Create existing file
            const configPath = path.join(testDir, DEFAULT_CONFIG_FILENAME);
            writeFileSync(configPath, 'existing content');

            const { registerInitCommand } = await import('../src/cli/init-command');
            const { program } = await import('commander');

            const testProgram = program.createCommand();
            testProgram.exitOverride(); // Prevent process.exit()
            registerInitCommand(testProgram);

            await expect(
                testProgram.parseAsync(['node', 'test', 'init'])
            ).rejects.toThrow();

            // Original content preserved
            expect(readFileSync(configPath, 'utf-8')).toBe('existing content');
        });

        it('refuses to overwrite existing .env.vectorlint without --force', async () => {
            const envPath = path.join(testDir, '.env.vectorlint');
            writeFileSync(envPath, 'existing env content');

            const { registerInitCommand } = await import('../src/cli/init-command');
            const { program } = await import('commander');

            const testProgram = program.createCommand();
            testProgram.exitOverride();
            registerInitCommand(testProgram);

            await expect(
                testProgram.parseAsync(['node', 'test', 'init'])
            ).rejects.toThrow();

            expect(readFileSync(envPath, 'utf-8')).toBe('existing env content');
        });
    });

    describe('Force Flag', () => {
        it('overwrites existing files when --force is provided', async () => {
            // Create existing files
            const configPath = path.join(testDir, DEFAULT_CONFIG_FILENAME);
            const envPath = path.join(testDir, '.env.vectorlint');
            writeFileSync(configPath, 'old config');
            writeFileSync(envPath, 'old env');

            const { registerInitCommand } = await import('../src/cli/init-command');
            const { program } = await import('commander');

            const testProgram = program.createCommand();
            registerInitCommand(testProgram);

            await testProgram.parseAsync(['node', 'test', 'init', '--force']);

            // Files should be overwritten with new content
            const configContent = readFileSync(configPath, 'utf-8');
            const envContent = readFileSync(envPath, 'utf-8');

            expect(configContent).toContain('# VectorLint Configuration');
            expect(envContent).toContain('# VectorLint Environment Configuration');
        });
    });
});
