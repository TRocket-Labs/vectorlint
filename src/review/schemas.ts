import { z } from 'zod';
import { REVIEW_BUDGET_SCHEMA } from './budget';

/**
 * Zod schemas mirroring src/review/types.ts (boundary validation).
 *
 * Every external review-domain shape has a paired schema here so callers and
 * external adapters can validate untrusted input at the system boundary.
 * Schemas reject unknown keys.
 */

export const REVIEW_SEVERITY_SCHEMA = z.enum(['error', 'warning']);

export const REVIEW_VIOLATION_CONDITION_SCHEMA = z
  .object({
    id: z.string().min(1),
    description: z.string().min(1),
  })
  .strict();

export const REVIEW_TARGET_SCHEMA = z
  .object({
    uri: z.string().min(1),
    content: z.string(),
    contentType: z.string().min(1),
    byteLength: z.number().int().nonnegative().optional(),
  })
  .strict();

export const REVIEW_RULE_SCHEMA = z
  .object({
    id: z.string().min(1),
    source: z.string().min(1),
    body: z.string(),
    name: z.string().optional(),
    severity: REVIEW_SEVERITY_SCHEMA.default('warning'),
    violationConditions: z.array(REVIEW_VIOLATION_CONDITION_SCHEMA).optional(),
  })
  .strict();

export const REVIEW_CONTEXT_SCHEMA = z
  .object({
    label: z.string().min(1),
    content: z.string(),
    relation: z.string().optional(),
    uri: z.string().optional(),
  })
  .strict();

export const REVIEW_OUTPUT_POLICY_SCHEMA = z
  .object({
    includeUsage: z.boolean(),
    recordPayloadTelemetry: z.boolean(),
  })
  .strict();

export const REVIEW_DIAGNOSTIC_LEVEL_SCHEMA = z.enum(['info', 'warn', 'error']);

export const REVIEW_SCORE_COMPONENT_SCHEMA = z
  .object({
    id: z.string().min(1),
    scoreText: z.string(),
    score: z.number(),
    weight: z.number().optional(),
  })
  .strict();

export const REVIEW_SCORE_SCHEMA = z
  .object({
    ruleId: z.string().min(1),
    score: z.number(),
    scoreText: z.string(),
    severity: REVIEW_SEVERITY_SCHEMA,
    findingCount: z.number().int().nonnegative().optional(),
    components: z.array(REVIEW_SCORE_COMPONENT_SCHEMA).optional(),
  })
  .strict();

export const REVIEW_FINDING_SCHEMA = z
  .object({
    ruleId: z.string().min(1),
    ruleSource: z.string().min(1),
    severity: REVIEW_SEVERITY_SCHEMA,
    message: z.string(),
    line: z.number().int().positive(),
    column: z.number().int().positive(),
    match: z.string(),
    analysis: z.string().optional(),
    suggestion: z.string().optional(),
    fix: z.string().optional(),
  })
  .strict();

export const REVIEW_DIAGNOSTIC_SCHEMA = z
  .object({
    level: REVIEW_DIAGNOSTIC_LEVEL_SCHEMA,
    code: z.string().min(1),
    message: z.string(),
    ruleId: z.string().optional(),
    context: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const REVIEW_USAGE_SCHEMA = z
  .object({
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    modelCalls: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative().optional(),
    wallClockMs: z.number().int().nonnegative().optional(),
  })
  .strict();

export const REVIEW_RESULT_SCHEMA = z
  .object({
    findings: z.array(REVIEW_FINDING_SCHEMA),
    scores: z.array(REVIEW_SCORE_SCHEMA),
    diagnostics: z.array(REVIEW_DIAGNOSTIC_SCHEMA),
    usage: REVIEW_USAGE_SCHEMA.optional(),
    hadOperationalErrors: z.boolean().optional(),
  })
  .strict();

export const REVIEW_REQUEST_SCHEMA = z
  .object({
    target: REVIEW_TARGET_SCHEMA,
    rules: z.array(REVIEW_RULE_SCHEMA).min(1),
    context: z.array(REVIEW_CONTEXT_SCHEMA).optional(),
    budget: REVIEW_BUDGET_SCHEMA,
    outputPolicy: REVIEW_OUTPUT_POLICY_SCHEMA,
    modelCall: z.enum(['single', 'agent', 'auto']),
  })
  .strict();
