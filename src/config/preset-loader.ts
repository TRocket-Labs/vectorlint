import { readFileSync, existsSync } from 'fs';
import * as path from 'path';
import { PRESET_REGISTRY_SCHEMA, type PresetRegistry } from '../schemas/preset-schemas';

export class PresetLoader {
    private registry: PresetRegistry | null = null;
    private readonly presetsDir: string;

    constructor(presetsDir: string) {
        this.presetsDir = presetsDir;
    }

    /**
     * Loads and validates the preset registry from meta.json
     */
    loadRegistry(): void {
        if (this.registry) return;

        const metaPath = path.join(this.presetsDir, 'meta.json');
        if (!existsSync(metaPath)) {
            this.registry = { presets: {} };
            return;
        }

        try {
            const raw: unknown = JSON.parse(readFileSync(metaPath, 'utf-8'));
            this.registry = PRESET_REGISTRY_SCHEMA.parse(raw);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to load preset registry: ${msg}`);
        }
    }

    /**
     * Resolves the absolute path for a given preset name.
     * Returns null if the preset is not found.
     */
    getPresetPath(name: string): string | null {
        this.loadRegistry();
        const preset = this.registry?.presets[name];
        if (!preset) return null;
        return path.resolve(this.presetsDir, preset.path);
    }

    /**
     * Returns a list of all available preset names.
     */
    getAvailablePresets(): string[] {
        this.loadRegistry();
        return Object.keys(this.registry?.presets || {});
    }
}
