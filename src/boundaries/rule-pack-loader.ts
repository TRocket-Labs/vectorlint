import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { PresetLoader } from '../config/preset-loader';

export interface ResolvedPack {
    name: string;
    path: string;
    isPreset: boolean;
}

export class RulePackLoader {
    private presetLoader: PresetLoader | undefined;

    constructor(presetLoader?: PresetLoader) {
        this.presetLoader = presetLoader;
    }

    /**
     * Discovers all available rule packs, merging user definitions and presets.
     * User rules strictly shadow presets with the same name.
     * @param userRulesPath The path to the user's local rules directory
     * @returns A list of resolved packs (user or preset)
     */
    async listAllPacks(userRulesPath: string): Promise<ResolvedPack[]> {
        const packs = new Map<string, ResolvedPack>();

        // 1. Load Presets first (lowest priority)
        if (this.presetLoader) {
            const presetNames = this.presetLoader.getAvailablePresets();
            for (const name of presetNames) {
                const pPath = this.presetLoader.getPresetPath(name);
                if (pPath) {
                    packs.set(name, { name, path: pPath, isPreset: true });
                }
            }
        }

        // 2. Load User Rules (highest priority, overwrites presets)
        let userEntries: string[] = [];
        try {
            await fs.access(userRulesPath);
            const entries = await fs.readdir(userRulesPath, { withFileTypes: true });
            userEntries = entries
                .filter(entry => entry.isDirectory())
                .map(entry => entry.name);
        } catch (e: unknown) {
            // It's acceptable if the user rules path doesn't exist yet,
            // provided we have presets. If neither, the caller might complain later if no rules found.
        }

        for (const entryName of userEntries) {
            packs.set(entryName, {
                name: entryName,
                path: path.join(userRulesPath, entryName),
                isPreset: false
            });
        }

        return Array.from(packs.values());
    }

    /**
     * Recursively finds all evaluation files in a pack directory.
     * @param packRoot The root directory of the eval pack
     * @returns A list of absolute file paths to evaluation files
     */
    async findRuleFiles(packPath: string): Promise<string[]> {
        const rules: string[] = [];

        if (!existsSync(packPath)) {
            throw new Error(`Pack directory not accessible: ${packPath}`);
        }

        async function scanDir(currentPath: string) {
            const entries = await fs.readdir(currentPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);

                if (entry.isDirectory()) {
                    await scanDir(fullPath);
                } else if (entry.isFile() && entry.name.endsWith('.md')) {
                    rules.push(fullPath);
                }
            }
        }

        await scanDir(packPath);
        return rules;
    }
}
