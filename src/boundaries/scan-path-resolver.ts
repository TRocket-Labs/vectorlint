import micromatch from 'micromatch';
import type { FilePatternConfig } from './file-section-parser';

export interface FileResolution {
    packs: string[];
    overrides: Record<string, unknown>;
}

export class ScanPathResolver {
    resolveEvaluationsForFile(
        filePath: string,
        sections: FilePatternConfig[],
        availablePacks?: string[]
    ): FileResolution {
        const activePacks: Set<string> = new Set();
        let mergedOverrides: Record<string, unknown> = {};
        let hasMatch = false;

        for (const section of sections) {
            if (micromatch.isMatch(filePath, section.pattern)) {
                hasMatch = true;
                // Add packs from this section
                if (section.runRules !== undefined) {
                    // If runRules is present (even if empty), it replaces previous packs
                    activePacks.clear();
                    for (const pack of section.runRules) {
                        activePacks.add(pack);
                    }

                    // If runRules is explicitly empty (exclusion), clear overrides too
                    if (section.runRules.length === 0) {
                        mergedOverrides = {};
                    }
                }

                // Merge overrides (later sections override earlier ones)
                // Only merge if this section doesn't have an explicit exclusion
                if (section.overrides && !(section.runRules !== undefined && section.runRules.length === 0)) {
                    mergedOverrides = { ...mergedOverrides, ...section.overrides };
                }
            }
        }

        if (!hasMatch) {
            throw new Error(`No configuration found for this path: ${filePath}`);
        }

        // Filter to only available packs if provided
        let finalPacks = Array.from(activePacks);
        if (availablePacks) {
            finalPacks = finalPacks.filter(pack => availablePacks.includes(pack));
        }

        return {
            packs: finalPacks,
            overrides: mergedOverrides
        };
    }
}
