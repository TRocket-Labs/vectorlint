import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { RulePackLoader } from '../src/boundaries/rule-pack-loader.js';
import type { PresetLoader } from '../src/config/preset-loader.js';

describe('RulePackLoader', () => {
    let tempDir: string;
    let loader: RulePackLoader;
    let mockPresetLoader: PresetLoader;

    beforeEach(() => {
        tempDir = mkdtempSync(path.join(tmpdir(), 'rule-pack-test-'));

        // Mock PresetLoader
        mockPresetLoader = {
            getAvailablePresets: vi.fn().mockReturnValue([]),
            getPresetPath: vi.fn(),
            loadRegistry: vi.fn(),
        } as unknown as PresetLoader;

        loader = new RulePackLoader(mockPresetLoader);
    });

    afterEach(() => {
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    describe('listAllPacks', () => {
        it('finds all subdirectories as pack names', async () => {
            // Create pack directories
            mkdirSync(path.join(tempDir, 'VectorLint'));
            mkdirSync(path.join(tempDir, 'CustomPack'));
            mkdirSync(path.join(tempDir, 'BlogPack'));

            // Add a file (should be ignored)
            writeFileSync(path.join(tempDir, 'README.md'), '# Prompts');

            const packs = await loader.listAllPacks(tempDir);
            const packNames = packs.map(p => p.name);

            expect(packs).toHaveLength(3);
            expect(packNames).toContain('VectorLint');
            expect(packNames).toContain('CustomPack');
            expect(packNames).toContain('BlogPack');
            expect(packNames).not.toContain('README.md');
            expect(packs.find(p => p.name === 'VectorLint')?.isPreset).toBe(false);
        });

        it('returns empty array when directory has no subdirectories and no presets', async () => {
            // Empty directory
            const packs = await loader.listAllPacks(tempDir);

            expect(packs).toEqual([]);
        });

        it('includes unique presets not in user directory', async () => {
            // Preset exists
            vi.mocked(mockPresetLoader.getAvailablePresets).mockReturnValue(['Standard']);
            vi.mocked(mockPresetLoader.getPresetPath).mockReturnValue('/mock/preset/path');

            // User directory empty
            const packs = await loader.listAllPacks(tempDir);

            expect(packs).toHaveLength(1);
            expect(packs[0]).toEqual({
                name: 'Standard',
                path: '/mock/preset/path',
                isPreset: true
            });
        });

        it('shadows preset with user pack when names match', async () => {
            // Preset exists
            vi.mocked(mockPresetLoader.getAvailablePresets).mockReturnValue(['VectorLint']);
            vi.mocked(mockPresetLoader.getPresetPath).mockReturnValue('/mock/preset/path');

            // User has same pack
            mkdirSync(path.join(tempDir, 'VectorLint'));

            const packs = await loader.listAllPacks(tempDir);

            expect(packs).toHaveLength(1);
            expect(packs[0]).toEqual({
                name: 'VectorLint',
                path: path.join(tempDir, 'VectorLint'), // User path
                isPreset: false
            });
        });

        it('does NOT throw error when prompts path does not exist (just returns empty/presets)', async () => {
            const nonExistentPath = path.join(tempDir, 'does-not-exist');
            const packs = await loader.listAllPacks(nonExistentPath);
            expect(packs).toEqual([]);
        });
    });

    describe('findRuleFiles', () => {
        it('finds all .md files recursively', async () => {
            const packDir = path.join(tempDir, 'VectorLint');
            mkdirSync(packDir);
            mkdirSync(path.join(packDir, 'Advanced'));
            mkdirSync(path.join(packDir, 'Advanced', 'Deep'));

            // Create .md files
            writeFileSync(path.join(packDir, 'technical-accuracy.md'), '# Eval');
            writeFileSync(path.join(packDir, 'readability.md'), '# Eval');
            writeFileSync(path.join(packDir, 'Advanced', 'deep-check.md'), '# Eval');
            writeFileSync(path.join(packDir, 'Advanced', 'Deep', 'nested.md'), '# Eval');

            const files = await loader.findRuleFiles(packDir);

            expect(files).toHaveLength(4);
            expect(files).toContain(path.join(packDir, 'technical-accuracy.md'));
            expect(files).toContain(path.join(packDir, 'readability.md'));
            expect(files).toContain(path.join(packDir, 'Advanced', 'deep-check.md'));
            expect(files).toContain(path.join(packDir, 'Advanced', 'Deep', 'nested.md'));
        });

        it('ignores non-.md files', async () => {
            const packDir = path.join(tempDir, 'TestPack');
            mkdirSync(packDir);

            // Create various file types
            writeFileSync(path.join(packDir, 'eval.md'), '# Eval');
            writeFileSync(path.join(packDir, 'README.txt'), 'text file');
            writeFileSync(path.join(packDir, 'script.js'), 'console.log()');
            writeFileSync(path.join(packDir, 'config.json'), '{}');

            const files = await loader.findRuleFiles(packDir);

            expect(files).toHaveLength(1);
            expect(files[0]).toBe(path.join(packDir, 'eval.md'));
        });

        it('returns empty array when pack directory is empty', async () => {
            const packDir = path.join(tempDir, 'EmptyPack');
            mkdirSync(packDir);

            const files = await loader.findRuleFiles(packDir);

            expect(files).toEqual([]);
        });

        it('returns empty array when pack has only subdirectories with no files', async () => {
            const packDir = path.join(tempDir, 'EmptyPack');
            mkdirSync(packDir);
            mkdirSync(path.join(packDir, 'SubDir1'));
            mkdirSync(path.join(packDir, 'SubDir2'));

            const files = await loader.findRuleFiles(packDir);

            expect(files).toEqual([]);
        });

        it('throws error when pack directory does not exist', async () => {
            const nonExistentPack = path.join(tempDir, 'NonExistentPack');

            await expect(loader.findRuleFiles(nonExistentPack)).rejects.toThrow(
                `Pack directory not accessible: ${nonExistentPack}`
            );
        });

        it('returns absolute file paths', async () => {
            const packDir = path.join(tempDir, 'AbsolutePack');
            mkdirSync(packDir);
            writeFileSync(path.join(packDir, 'test.md'), '# Test');

            const files = await loader.findRuleFiles(packDir);

            expect(files).toHaveLength(1);
            expect(path.isAbsolute(files[0])).toBe(true);
            expect(files[0]).toBe(path.join(packDir, 'test.md'));
        });
    });
});
