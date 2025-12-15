
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { PresetLoader } from '../src/config/preset-loader.js';

describe('PresetLoader', () => {
    let tempDir: string;
    let loader: PresetLoader;

    beforeEach(() => {
        tempDir = mkdtempSync(path.join(tmpdir(), 'preset-test-'));
        loader = new PresetLoader(tempDir);
    });

    afterEach(() => {
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    describe('getAvailablePresets', () => {
        it('returns empty array when registry does not exist', () => {
            loader.loadRegistry();
            expect(loader.getAvailablePresets()).toEqual([]);
        });

        it('returns presets defined in meta.json', () => {
            const registry = {
                presets: {
                    'VectorLint': { path: './VectorLint' },
                    'AnotherPack': { path: '/abs/path/to/pack' }
                }
            };
            writeFileSync(path.join(tempDir, 'meta.json'), JSON.stringify(registry));

            loader.loadRegistry();
            const presets = loader.getAvailablePresets();

            expect(presets).toHaveLength(2);
            expect(presets).toContain('VectorLint');
            expect(presets).toContain('AnotherPack');
        });
    });

    describe('getPresetPath', () => {
        it('resolves relative paths relative to presets directory', () => {
            const registry = {
                presets: {
                    'VectorLint': { path: './VectorLint' }
                }
            };
            writeFileSync(path.join(tempDir, 'meta.json'), JSON.stringify(registry));

            loader.loadRegistry();
            const presetPath = loader.getPresetPath('VectorLint');

            expect(presetPath).toBe(path.resolve(tempDir, './VectorLint'));
        });

        it('resolves absolute paths as is', () => {
            const absPath = path.resolve(tempDir, 'CustomPack'); // Just meaningful path, doesn't need to exist on FS for resolution logic
            const registry = {
                presets: {
                    'CustomPack': { path: absPath }
                }
            };
            writeFileSync(path.join(tempDir, 'meta.json'), JSON.stringify(registry));

            loader.loadRegistry();
            const presetPath = loader.getPresetPath('CustomPack');

            expect(presetPath).toBe(absPath);
        });

        it('returns null for non-existent preset', () => {
            loader.loadRegistry();
            expect(loader.getPresetPath('NonExistent')).toBeNull();
        });
    });

    describe('loadRegistry validation', () => {
        it('throws error for invalid JSON', () => {
            writeFileSync(path.join(tempDir, 'meta.json'), '{ invalid json');
            expect(() => loader.loadRegistry()).toThrow();
        });

        it('throws error for invalid schema', () => {
            // Missing 'presets' key
            writeFileSync(path.join(tempDir, 'meta.json'), JSON.stringify({ notPresets: {} }));
            expect(() => loader.loadRegistry()).toThrow();
        });
    });
});
