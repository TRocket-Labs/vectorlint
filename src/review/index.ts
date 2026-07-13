/**
 * Neutral review-domain contract for the VectorLint harness.
 *
 * Everything an executor needs to review target content against
 * source-backed rules flows through this module. The CLI, headless adapters,
 * and external callers all build a ReviewRequest and receive a ReviewResult.
 *
 * See docs/audits/2026-07-10-vectorlint-harness-architecture-audit.md.
 */
export * from './types';
export * from './schemas';
export * from './budget';
export * from './boundary';
export * from './executor';
export * from './request-builder';
