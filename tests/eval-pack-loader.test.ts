import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { EvalPackLoader } from '../src/boundaries/eval-pack-loader.js';

describe('EvalPackLoader', () => {
    let tempDir: string;
    let loader: EvalPackLoader;

    beforeEach(() => {
        tempDir = mkdtempSync(path.join(tmpdir(), 'eval-pack-test-'));
        loader = new EvalPackLoader();
    });

    afterEach(() => {
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    describe('findAllPacks', () => {
        it('finds all subdirectories as pack names', async () => {
            // Create pack directories
            mkdirSync(path.join(tempDir, 'VectorLint'));
            mkdirSync(path.join(tempDir, 'CustomPack'));
            mkdirSync(path.join(tempDir, 'BlogPack'));

            // Add a file (should be ignored)
            writeFileSync(path.join(tempDir, 'README.md'), '# Prompts');

            const packs = await loader.findAllPacks(tempDir);

            expect(packs).toHaveLength(3);
            expect(packs).toContain('VectorLint');
            expect(packs).toContain('CustomPack');
            expect(packs).toContain('BlogPack');
            expect(packs).not.toContain('README.md');
        });

        it('returns empty array when directory has no subdirectories', async () => {
            // Empty directory
            const packs = await loader.findAllPacks(tempDir);

            expect(packs).toEqual([]);
        });

        it('throws error when prompts path does not exist', async () => {
            const nonExistentPath = path.join(tempDir, 'does-not-exist');

            await expect(loader.findAllPacks(nonExistentPath)).rejects.toThrow(
                `Prompts path not accessible: ${nonExistentPath}`
            );
        });
    });

    describe('findEvalFiles', () => {
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

            const files = await loader.findEvalFiles(packDir);

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

            const files = await loader.findEvalFiles(packDir);

            expect(files).toHaveLength(1);
            expect(files[0]).toBe(path.join(packDir, 'eval.md'));
        });

        it('returns empty array when pack directory is empty', async () => {
            const packDir = path.join(tempDir, 'EmptyPack');
            mkdirSync(packDir);

            const files = await loader.findEvalFiles(packDir);

            expect(files).toEqual([]);
        });

        it('returns empty array when pack has only subdirectories with no files', async () => {
            const packDir = path.join(tempDir, 'EmptyPack');
            mkdirSync(packDir);
            mkdirSync(path.join(packDir, 'SubDir1'));
            mkdirSync(path.join(packDir, 'SubDir2'));

            const files = await loader.findEvalFiles(packDir);

            expect(files).toEqual([]);
        });

        it('throws error when pack directory does not exist', async () => {
            const nonExistentPack = path.join(tempDir, 'NonExistentPack');

            await expect(loader.findEvalFiles(nonExistentPack)).rejects.toThrow(
                `Pack directory not accessible: ${nonExistentPack}`
            );
        });

        it('returns absolute file paths', async () => {
            const packDir = path.join(tempDir, 'AbsolutePack');
            mkdirSync(packDir);
            writeFileSync(path.join(packDir, 'test.md'), '# Test');

            const files = await loader.findEvalFiles(packDir);

            expect(files).toHaveLength(1);
            expect(path.isAbsolute(files[0])).toBe(true);
            expect(files[0]).toBe(path.join(packDir, 'test.md'));
        });
    });
});
