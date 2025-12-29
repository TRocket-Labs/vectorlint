
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadGlobalConfig, getGlobalConfigPath } from '../src/config/global-config';
import { GLOBAL_CONFIG_DIR, GLOBAL_CONFIG_FILE } from '../src/config/constants';

// Mock fs and os
vi.mock('fs');
vi.mock('os');

describe('Global Config Loader', () => {
    const mockHomeDir = '/mock/home';
    const mockConfigPath = path.join(mockHomeDir, GLOBAL_CONFIG_DIR, GLOBAL_CONFIG_FILE);

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(os.homedir).mockReturnValue(mockHomeDir);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should load global config and inject env vars', () => {
        const mockToml = `
[env]
TEST_KEY = "test-value"
ANOTHER_KEY = "123"
NUMBER_KEY = 123
BOOL_KEY = true
`;
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(mockToml);

        // Ensure key doesn't exist
        delete process.env.TEST_KEY;
        delete process.env.ANOTHER_KEY;
        delete process.env.NUMBER_KEY;
        delete process.env.BOOL_KEY;

        loadGlobalConfig();

        expect(process.env.TEST_KEY).toBe('test-value');
        expect(process.env.ANOTHER_KEY).toBe('123');
        expect(process.env.NUMBER_KEY).toBe('123');
        expect(process.env.BOOL_KEY).toBe('true');
        expect(fs.readFileSync).toHaveBeenCalledWith(mockConfigPath, 'utf-8');
    });

    it('should NOT overwrite existing env vars', () => {
        const mockToml = `
[env]
EXISTING_KEY = "new-value"
`;
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(mockToml);

        process.env.EXISTING_KEY = 'original-value';

        loadGlobalConfig();

        expect(process.env.EXISTING_KEY).toBe('original-value');
    });

    it('should handle missing config file gracefull', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false); // Config doesn't exist

        loadGlobalConfig();

        // Should not crash
        expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('should ignore invalid TOML gracefully', () => {
        const mockToml = `INVALID TOML_CONTENT`;
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(mockToml);

        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

        loadGlobalConfig();

        expect(consoleSpy).toHaveBeenCalled();
    });
});
