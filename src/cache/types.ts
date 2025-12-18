import { Severity } from '../evaluators/types';

/**
 * Unique key for cache entries consisting of file path and content/prompt hashes.
 */
export interface CacheKey {
    filePath: string;
    contentHash: string;
    promptsHash: string;
}


/**
 * Minimal issue data stored in cache for replay.
 */
export interface CachedIssue {
    line: number;
    column: number;
    severity: Severity;
    summary: string;
    ruleName: string;
    suggestion?: string | undefined;
    scoreText?: string | undefined;
    match?: string | undefined;
}

export interface CachedEvaluationSummary {
    id: string;
    scoreText: string;
    score?: number;
}

export interface CachedScore {
    ruleName: string;
    items: CachedEvaluationSummary[];
}
export interface CachedResult {
    errors: number;
    warnings: number;
    hadOperationalErrors: boolean;
    hadSeverityErrors: boolean;
    requestFailures: number;
    issues?: CachedIssue[];
    scores?: CachedScore[];
    jsonOutput?: unknown;
    timestamp: number;
}

export interface CacheData {
    version: number;
    entries: Record<string, CachedResult>;
}

export interface CacheOptions {
    enabled: boolean;
    forceFullRun: boolean;
    cacheDir?: string;
}
