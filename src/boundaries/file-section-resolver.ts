import micromatch from 'micromatch';
import { FilePatternConfig } from './file-section-parser';

export interface FileResolution {
    packs: string[];
    overrides: Record<string, any>;
}

export class FileSectionResolver {
    /**
     * Resolves the active packs and overrides for a specific file based on the parsed sections.
     * @param filePath The relative path of the file to check
     * @param sections The parsed file sections from the config
     * @param availablePacks The list of available pack names (optional validation)
     * @returns The resolved packs and merged overrides
     */
    resolveEvaluationsForFile(
        filePath: string,
        sections: FilePatternConfig[],
        availablePacks: string[] = []
    ): FileResolution {
        let activePacks: Set<string> = new Set();
        let mergedOverrides: Record<string, any> = {};

        for (const section of sections) {
            if (micromatch.isMatch(filePath, section.pattern)) {
                // Handle RunEvals
                if (section.runEvals.length === 0) {
                    // Explicit exclusion: clear active packs
                    activePacks.clear();
                    // Should we clear overrides too? 
                    // Usually yes, if we are resetting the configuration for this file.
                    mergedOverrides = {};
                } else {
                    for (const packName of section.runEvals) {
                        // Validate if pack exists (if availablePacks provided)
                        if (availablePacks.length > 0 && !availablePacks.includes(packName)) {
                            console.warn(`[vectorlint] Warning: Pack "${packName}" not found`);
                            console.warn(`[vectorlint] Available packs: ${availablePacks.join(', ')}`);
                            continue;
                        }
                        activePacks.add(packName);
                    }
                }

                // Merge overrides
                // Later sections override earlier ones
                mergedOverrides = { ...mergedOverrides, ...section.overrides };
            }
        }

        return {
            packs: Array.from(activePacks),
            overrides: mergedOverrides
        };
    }
}
