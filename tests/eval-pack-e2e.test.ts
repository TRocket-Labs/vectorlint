import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { EvalPackLoader } from '../src/boundaries/eval-pack-loader.js';
import { loadConfig } from '../src/boundaries/config-loader.js';
import { ScanPathResolver } from '../src/boundaries/scan-path-resolver.js';
import { DEFAULT_CONFIG_FILENAME } from '../src/config/constants.js';

describe('Eval Pack System End-to-End', () => {
    let tempDir: string;
    let promptsDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(path.join(tmpdir(), 'e2e-test-'));
        promptsDir = path.join(tempDir, 'prompts');

        mkdirSync(promptsDir);
    });

    afterEach(() => {
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('complete workflow: config → packs → files → resolution', async () => {
        // 1. Setup eval pack structure
        const vectorLintDir = path.join(promptsDir, 'VectorLint');
        const customPackDir = path.join(promptsDir, 'CustomPack');

        mkdirSync(vectorLintDir);
        mkdirSync(path.join(vectorLintDir, 'Technical'));
        mkdirSync(customPackDir);

        // Create eval files
        writeFileSync(
            path.join(vectorLintDir, 'technical-accuracy.md'),
            '---\nid: technical-accuracy\n---\n# Technical Accuracy'
        );
        writeFileSync(
            path.join(vectorLintDir, 'readability.md'),
            '---\nid: readability\n---\n# Readability'
        );
        writeFileSync(
            path.join(vectorLintDir, 'Technical', 'deep-check.md'),
            '---\nid: deep-check\n---\n# Deep Check'
        );
        writeFileSync(
            path.join(customPackDir, 'custom-eval.md'),
            '---\nid: custom-eval\n---\n# Custom'
        );

        // 2. Create config file
        const iniContent = `
RulesPath = ${promptsDir}

[docs/**/*.md]
RunRules = VectorLint
technical-accuracy.strictness = 9

[docs/blog/**/*.md]
RunRules = VectorLint, CustomPack
readability.severity = error
`;
        writeFileSync(path.join(tempDir, DEFAULT_CONFIG_FILENAME), iniContent);

        // 3. Load configuration
        const config = loadConfig(tempDir);

        expect(config.scanPaths).toHaveLength(2);
        expect(config.rulesPath).toBe(promptsDir);

        // 4. Discover eval packs
        const loader = new EvalPackLoader();
        const packs = await loader.findAllPacks(promptsDir);

        expect(packs).toHaveLength(2);
        expect(packs).toContain('VectorLint');
        expect(packs).toContain('CustomPack');

        // 5. Load eval files from packs
        const vectorLintFiles = await loader.findEvalFiles(vectorLintDir);
        const customPackFiles = await loader.findEvalFiles(customPackDir);

        expect(vectorLintFiles).toHaveLength(3);
        expect(customPackFiles).toHaveLength(1);

        // 6. Resolve for specific files
        const resolver = new ScanPathResolver();

        // Test file in docs/
        const docsFileResolution = resolver.resolveConfiguration(
            'docs/guide.md',
            config.scanPaths,
            packs
        );

        expect(docsFileResolution.packs).toEqual(['VectorLint']);
        expect(docsFileResolution.overrides).toEqual({
            'technical-accuracy.strictness': '9'
        });

        // Test file in docs/blog/
        const blogFileResolution = resolver.resolveConfiguration(
            'docs/blog/post.md',
            config.scanPaths,
            packs
        );

        expect(blogFileResolution.packs).toContain('VectorLint');
        expect(blogFileResolution.packs).toContain('CustomPack');
        expect(blogFileResolution.overrides).toEqual({
            'technical-accuracy.strictness': '9',
            'readability.severity': 'error'
        });
    });

    it('handles pack validation and exclusions', async () => {
        // 1. Setup single pack
        const vectorLintDir = path.join(promptsDir, 'VectorLint');
        mkdirSync(vectorLintDir);
        writeFileSync(
            path.join(vectorLintDir, 'eval.md'),
            '---\nid: test\n---\n# Test'
        );

        // 2. Config references non-existent pack
        const iniContent = `
RulesPath = ${promptsDir}

[docs/**/*.md]
RunRules = VectorLint, NonExistentPack

[docs/archived/**/*.md]
RunRules = 
`;
        writeFileSync(path.join(tempDir, DEFAULT_CONFIG_FILENAME), iniContent);

        // 3. Load and resolve
        const config = loadConfig(tempDir);
        const loader = new EvalPackLoader();
        const packs = await loader.findAllPacks(promptsDir);
        const resolver = new ScanPathResolver();

        // Non-existent pack should be filtered out
        const docsResolution = resolver.resolveConfiguration(
            'docs/test.md',
            config.scanPaths,
            packs
        );

        expect(docsResolution.packs).toEqual(['VectorLint']);
        expect(docsResolution.packs).not.toContain('NonExistentPack');

        // Explicit exclusion
        const archivedResolution = resolver.resolveConfiguration(
            'docs/archived/old.md',
            config.scanPaths,
            packs
        );

        // With Cascading logic, packs are additive. 
        // Explicit empty list in specific config does NOT remove base packs.
        expect(archivedResolution.packs).toEqual(['VectorLint']);
        expect(archivedResolution.overrides).toEqual({});
    });

    it('handles nested pack directories correctly', async () => {
        // Create deeply nested structure
        const packDir = path.join(promptsDir, 'DeepPack');
        const level1 = path.join(packDir, 'Level1');
        const level2 = path.join(level1, 'Level2');
        const level3 = path.join(level2, 'Level3');

        mkdirSync(packDir);
        mkdirSync(level1);
        mkdirSync(level2);
        mkdirSync(level3);

        writeFileSync(path.join(packDir, 'root.md'), '# Root');
        writeFileSync(path.join(level1, 'l1.md'), '# L1');
        writeFileSync(path.join(level2, 'l2.md'), '# L2');
        writeFileSync(path.join(level3, 'l3.md'), '# L3');

        const loader = new EvalPackLoader();
        const files = await loader.findEvalFiles(packDir);

        expect(files).toHaveLength(4);
        expect(files.some(f => f.endsWith('root.md'))).toBe(true);
        expect(files.some(f => f.endsWith('l1.md'))).toBe(true);
        expect(files.some(f => f.endsWith('l2.md'))).toBe(true);
        expect(files.some(f => f.endsWith('l3.md'))).toBe(true);
    });
});
