import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { loadConfig } from '../../src/boundaries/config-loader';
import { DEFAULT_CONFIG_FILENAME, STYLE_GUIDE_FILENAME } from '../../src/config/constants';

describe('Zero-Config Loading', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(path.join(tmpdir(), 'vectorlint-zero-config-'));
    });

    afterEach(() => {
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('returns default config when only VECTORLINT.md exists', () => {
        // Create only the style guide
        writeFileSync(path.join(tempDir, STYLE_GUIDE_FILENAME), '# My Style Guide');

        const config = loadConfig(tempDir);

        expect(config.rulesPath).toBeUndefined();
        expect(config.concurrency).toBe(4);
        expect(config.scanPaths).toHaveLength(1);
        expect(config.scanPaths[0]!.pattern).toBe('**/*.{md,txt,mdx}');
        expect(config.scanPaths[0]!.runRules).toEqual([]);
        expect(config.configDir).toBe(tempDir);
    });

    it('prefers .vectorlint.ini if both exist', () => {
        // Create both files
        writeFileSync(path.join(tempDir, STYLE_GUIDE_FILENAME), '# My Style Guide');

        const iniContent = `
RulesPath = ./custom-rules
[docs/*.md]
RunRules = CustomPack
`;
        writeFileSync(path.join(tempDir, DEFAULT_CONFIG_FILENAME), iniContent);

        const config = loadConfig(tempDir);

        // Should use the values from the ini file
        expect(config.rulesPath).toContain('custom-rules');
        expect(config.scanPaths[0]!.pattern).toBe('docs/*.md');
    });

    it('throws error if neither file exists', () => {
        expect(() => loadConfig(tempDir)).toThrow(/Missing configuration file/);
    });
});
