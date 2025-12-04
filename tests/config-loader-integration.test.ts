import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { loadConfig } from '../src/boundaries/config-loader.js';

describe('Config Loader Integration', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(path.join(tmpdir(), 'config-integration-'));
    });

    afterEach(() => {
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('loads config with file sections', () => {
        const iniContent = `
RulesPath = ./prompts
ScanPaths = ["**/*.md"]

[docs/**/*.md]
RunRules = VectorLint
technical-accuracy.strictness = 9

[blog/**/*.md]
RunRules = BlogPack, SEOPack
readability.severity = error
`;
        writeFileSync(path.join(tempDir, 'vectorlint.ini'), iniContent);

        const config = loadConfig(tempDir);

        expect(config.rulesPath).toContain('prompts');
        expect(config.scanPaths).toEqual(['**/*.md']);
        expect(config.fileSections).toHaveLength(2);

        // First section
        expect(config.fileSections[0]!.pattern).toBe('docs/**/*.md');
        expect(config.fileSections[0]!.runRules).toEqual(['VectorLint']);
        expect(config.fileSections[0]!.overrides).toEqual({
            'technical-accuracy.strictness': '9'
        });

        // Second section
        expect(config.fileSections[1]!.pattern).toBe('blog/**/*.md');
        expect(config.fileSections[1]!.runRules).toEqual(['BlogPack', 'SEOPack']);
        expect(config.fileSections[1]!.overrides).toEqual({
            'readability.severity': 'error'
        });
    });

    it('loads config with multiple file sections and various overrides', () => {
        const iniContent = `
RulesPath = ./prompts
ScanPaths = ["**/*.md"]

[content/**/*.md]
RunRules = Base
strictness = 7

[content/api/**/*.md]
RunRules = APIPack
strictness = 9
technical-accuracy.depth = high

[content/archived/**/*.md]
RunRules = 
`;
        writeFileSync(path.join(tempDir, 'vectorlint.ini'), iniContent);

        const config = loadConfig(tempDir);

        expect(config.fileSections).toHaveLength(3);

        // Third section has empty RunRules (exclusion)
        expect(config.fileSections[2]!.runRules).toEqual([]);
    });

    it('loads config without file sections (defaults to empty array)', () => {
        const iniContent = `
RulesPath = ./prompts
ScanPaths = ["**/*.md"]
`;
        writeFileSync(path.join(tempDir, 'vectorlint.ini'), iniContent);

        const config = loadConfig(tempDir);

        expect(config.fileSections).toEqual([]);
    });

    it('handles config with concurrency and default severity', () => {
        const iniContent = `
RulesPath = ./prompts
ScanPaths = ["**/*.md"]
Concurrency = 8
DefaultSeverity = error

[**/*.md]
RunRules = VectorLint
`;
        writeFileSync(path.join(tempDir, 'vectorlint.ini'), iniContent);

        const config = loadConfig(tempDir);

        expect(config.concurrency).toBe(8);
        expect(config.defaultSeverity).toBe('error');
        expect(config.fileSections).toHaveLength(1);
    });

    it('preserves order of file sections', () => {
        const iniContent = `
RulesPath = ./prompts
ScanPaths = ["**/*.md"]

[first/**/*.md]
RunRules = First

[second/**/*.md]
RunRules = Second

[third/**/*.md]
RunRules = Third
`;
        writeFileSync(path.join(tempDir, 'vectorlint.ini'), iniContent);

        const config = loadConfig(tempDir);

        expect(config.fileSections).toHaveLength(3);
        expect(config.fileSections[0]!.pattern).toBe('first/**/*.md');
        expect(config.fileSections[1]!.pattern).toBe('second/**/*.md');
        expect(config.fileSections[2]!.pattern).toBe('third/**/*.md');
    });
});
