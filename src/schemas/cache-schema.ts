import { z } from 'zod';

import { Severity } from '../evaluators/types';

// Schema for cached issues
const CACHED_ISSUE_SCHEMA = z.object({
    line: z.number(),
    column: z.number(),
    severity: z.nativeEnum(Severity),
    summary: z.string(),
    ruleName: z.string(),
    suggestion: z.string().optional(),
    scoreText: z.string().optional(),
    match: z.string().optional(),
});

// Schema for evaluation summary in scores
const CACHED_EVALUATION_SUMMARY_SCHEMA = z.object({
    id: z.string(),
    scoreText: z.string(),
    score: z.number().optional(),
});

// Schema for granular score components
const SCORE_COMPONENT_SCHEMA = z.object({
    criterion: z.string(),
    rawScore: z.number(),
    maxScore: z.number(),
    weightedScore: z.number(),
    weightedMaxScore: z.number(),
    normalizedScore: z.number(),
    normalizedMaxScore: z.number(),
});

// Schema for grouped scores
const CACHED_SCORE_SCHEMA = z.object({
    ruleName: z.string(),
    items: z.array(CACHED_EVALUATION_SUMMARY_SCHEMA),
    components: z.array(SCORE_COMPONENT_SCHEMA).optional(),
});

// Schema for the main cached result
const CACHED_RESULT_SCHEMA = z.object({
    errors: z.number(),
    warnings: z.number(),
    hadOperationalErrors: z.boolean(),
    hadSeverityErrors: z.boolean(),
    requestFailures: z.number(),
    issues: z.array(CACHED_ISSUE_SCHEMA).optional(),
    scores: z.array(CACHED_SCORE_SCHEMA).optional(),
    // Use unknown for jsonOutput as it can be any valid JSON structure
    jsonOutput: z.unknown().optional(),
    timestamp: z.number(),
});

export const CACHE_SCHEMA = z.object({
    version: z.number(),
    entries: z.record(z.string(), CACHED_RESULT_SCHEMA)
});