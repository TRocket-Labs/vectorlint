import micromatch from 'micromatch';
import type { FilePatternConfig } from './file-section-parser';
import type { FileResolution } from './types';

/**
 * Calculates a specificity score for a glob pattern.
 * Logic:
 * 1. Segments count (100 points each): Deeper paths > Shallow paths.
 * 2. Wildcards count (-10 points each): Explicit names > Wildcards.
 * 3. Length (1 point each): Longer patterns > Shorter patterns (Tie breaker).
 */
function getSpecificityScore(pattern: string): number {
    const segments = pattern.split('/').length;
    const wildcards = (pattern.match(/[*]/g) || []).length;
    return (segments * 100) - (wildcards * 10) + pattern.length;
}

export class ScanPathResolver {
    resolveConfiguration(
        filePath: string,
        sections: FilePatternConfig[],
        availablePacks?: string[]
    ): FileResolution {
        // 1. Find all matching sections
        const matches = sections.filter(section => micromatch.isMatch(filePath, section.pattern));

        if (matches.length === 0) {
            // No configuration matches this file
            throw new Error(`No configuration found for this path: ${filePath}`);
        }

        // 2. Sort matches by specificity (Ascending)
        // Apply General settings (low specificity) first, then Specific settings (high specificity).
        // JS sort is stable, so patterns with equal specificity preserve their definition order.
        // This ensures that later-defined rules correctly override earlier ones.
        matches.sort((a, b) => {
            const scoreA = getSpecificityScore(a.pattern);
            const scoreB = getSpecificityScore(b.pattern);
            // Ascending sort (Lower specificity score first)
            return scoreA - scoreB;
        });

        // 3. Cascading Merge
        const activePacks = new Set<string>();
        let overrides: Record<string, unknown> = {};

        for (const match of matches) {
            // Merge Packs (Additive)
            if (match.runRules) {
                for (const pack of match.runRules) {
                    activePacks.add(pack);
                }
            }

            // Merge Overrides (Specific Overwrites General)
            if (match.overrides) {
                overrides = { ...overrides, ...match.overrides };
            }
        }

        // Filter to only available packs if provided
        let finalPacks = Array.from(activePacks);
        if (availablePacks) {
            finalPacks = finalPacks.filter(pack => availablePacks.includes(pack));
        }

        return {
            packs: finalPacks,
            overrides: overrides
        };
    }
}
