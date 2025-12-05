import { type FilePatternConfig } from '../src/boundaries/file-section-parser.js';

/**
 * Helper to create FilePatternConfig objects compatible with exactOptionalPropertyTypes.
 * This ensures the optional runRules property is only added when it has a defined value.
 */
export function createFilePatternConfig(
    pattern: string,
    runRules: string[] | undefined,
    overrides: Record<string, unknown> = {}
): FilePatternConfig {
    const config: FilePatternConfig = { pattern, overrides };
    if (runRules !== undefined) {
        config.runRules = runRules;
    }
    return config;
}
