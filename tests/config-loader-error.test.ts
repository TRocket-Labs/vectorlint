import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { loadConfig } from '../src/boundaries/config-loader.js';
import { DEFAULT_CONFIG_FILENAME, USER_INSTRUCTION_FILENAME } from '../src/config/constants.js';

describe('Config Loader Error Message', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(path.join(tmpdir(), 'config-error-'));
    });

    afterEach(() => {
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('mentions VECTORLINT.md when config is missing', () => {
        expect(() => loadConfig(tempDir)).toThrow(
            `Missing configuration file. Expected ${DEFAULT_CONFIG_FILENAME} or ${USER_INSTRUCTION_FILENAME} in ${tempDir}`
        );
    });
});
