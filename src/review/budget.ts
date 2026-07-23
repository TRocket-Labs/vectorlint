import { z } from 'zod';
import type { ReviewBudget } from './types';
import { BudgetExceededError } from './errors';

/**
 * Sensible default bounds for a single review. Frozen so a
 * shared default object cannot be accidentally mutated by a caller.
 */
export const DEFAULT_REVIEW_BUDGET: Readonly<ReviewBudget> = Object.freeze({
  maxTargetBytes: 1_000_000,
  maxCallerContextBytes: 500_000,
  maxChunksPerRule: 20,
  maxModelCallsPerReview: 50,
  maxWallClockMs: 5 * 60_000,
});

/** Zod schema mirroring {@link ReviewBudget}, applying defaults for omitted fields. */
export const REVIEW_BUDGET_SCHEMA = z
  .object({
    maxTargetBytes: z.number().int().positive().default(DEFAULT_REVIEW_BUDGET.maxTargetBytes),
    maxCallerContextBytes: z
      .number()
      .int()
      .positive()
      .default(DEFAULT_REVIEW_BUDGET.maxCallerContextBytes),
    maxChunksPerRule: z.number().int().positive().default(DEFAULT_REVIEW_BUDGET.maxChunksPerRule),
    maxModelCallsPerReview: z
      .number()
      .int()
      .positive()
      .default(DEFAULT_REVIEW_BUDGET.maxModelCallsPerReview),
    maxWallClockMs: z.number().int().positive().default(DEFAULT_REVIEW_BUDGET.maxWallClockMs),
  })
  .strict();

/** Current resource usage, checked against a {@link ReviewBudget}. */
export interface BudgetUsage {
  modelCalls: number;
  elapsedMs: number;
}

/**
 * Throws {@link BudgetExceededError} if current usage violates a hard limit.
 * Executors call this before/after each model call and on timeout checks.
 * Only runtime counters (model calls, wall clock) are enforced here; size
 * limits (target/context bytes, chunks) are enforced at request-build time.
 */
export function enforceBudget(budget: ReviewBudget, usage: BudgetUsage): void {
  if (usage.modelCalls > budget.maxModelCallsPerReview) {
    throw new BudgetExceededError(
      `model calls (${usage.modelCalls}) exceed maxModelCallsPerReview (${budget.maxModelCallsPerReview})`,
      'maxModelCallsPerReview',
      usage.modelCalls,
    );
  }
  if (usage.elapsedMs > budget.maxWallClockMs) {
    throw new BudgetExceededError(
      `elapsed time (${usage.elapsedMs}ms) exceeds maxWallClockMs (${budget.maxWallClockMs}ms)`,
      'maxWallClockMs',
      usage.elapsedMs,
    );
  }
}
