import { vi } from 'vitest';
import { type FilePatternConfig } from '../src/boundaries/file-section-parser.js';
import type { Logger } from '../src/logging/logger';

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

export function createMockLogger(): Logger & {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
} {
    return {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
}
