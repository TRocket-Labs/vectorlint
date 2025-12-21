import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { loadConfig } from '../src/boundaries/config-loader.js';
import { DEFAULT_CONFIG_FILENAME } from '../src/config/constants.js';

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

[docs/**/*.md]
RunRules = VectorLint
technical-accuracy.strictness = 9

[blog/**/*.md]
RunRules = BlogPack, SEOPack
readability.severity = error
`;
        writeFileSync(path.join(tempDir, DEFAULT_CONFIG_FILENAME), iniContent);

        const config = loadConfig(tempDir);

        expect(config.rulesPath).toContain('prompts');
        expect(config.scanPaths).toHaveLength(2);

        // First section
        expect(config.scanPaths[0]!.pattern).toBe('docs/**/*.md');
        expect(config.scanPaths[0]!.runRules).toEqual(['VectorLint']);
        expect(config.scanPaths[0]!.overrides).toEqual({
            'technical-accuracy.strictness': '9'
        });

        // Second section
        expect(config.scanPaths[1]!.pattern).toBe('blog/**/*.md');
        expect(config.scanPaths[1]!.runRules).toEqual(['BlogPack', 'SEOPack']);
        expect(config.scanPaths[1]!.overrides).toEqual({
            'readability.severity': 'error'
        });
    });

    it('loads config with multiple file sections and various overrides', () => {
        const iniContent = `
RulesPath = ./prompts

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
        writeFileSync(path.join(tempDir, DEFAULT_CONFIG_FILENAME), iniContent);

        const config = loadConfig(tempDir);

        expect(config.scanPaths).toHaveLength(3);

        // Third section has empty RunRules (exclusion)
        expect(config.scanPaths[2]!.runRules).toEqual([]);
    });

    it('loads config without file sections (throws error)', () => {
        const iniContent = `
RulesPath = ./prompts
`;
        writeFileSync(path.join(tempDir, DEFAULT_CONFIG_FILENAME), iniContent);

        expect(() => loadConfig(tempDir)).toThrow(/At least one \[pattern\] path is required/);
    });

    it('handles config with concurrency and default severity', () => {
        const iniContent = `
RulesPath = ./prompts
Concurrency = 8
DefaultSeverity = error

[**/*.md]
RunRules = VectorLint
`;
        writeFileSync(path.join(tempDir, DEFAULT_CONFIG_FILENAME), iniContent);

        const config = loadConfig(tempDir);

        expect(config.concurrency).toBe(8);
        expect(config.defaultSeverity).toBe('error');
        expect(config.scanPaths).toHaveLength(1);
    });

    it('preserves order of file sections', () => {
        const iniContent = `
RulesPath = ./prompts

[first/**/*.md]
RunRules = First

[second/**/*.md]
RunRules = Second

[third/**/*.md]
RunRules = Third
`;
        writeFileSync(path.join(tempDir, DEFAULT_CONFIG_FILENAME), iniContent);

        const config = loadConfig(tempDir);

        expect(config.scanPaths).toHaveLength(3);
        expect(config.scanPaths[0]!.pattern).toBe('first/**/*.md');
        expect(config.scanPaths[1]!.pattern).toBe('second/**/*.md');
        expect(config.scanPaths[2]!.pattern).toBe('third/**/*.md');
    });
});
