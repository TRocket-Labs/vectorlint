import { describe, expect, it } from 'vitest';
import * as review from '../../src/review';

describe('src/review public surface', () => {
  it('exports the core contract values and functions', () => {
    // Runtime presence checks for values; types are checked by tsc.
    expect(review.REVIEW_MODEL_CALLS).toBeDefined();
    expect(review.DEFAULT_REVIEW_BUDGET).toBeDefined();
    expect(typeof review.chooseModelCall).toBe('function');
    expect(typeof review.isInScope).toBe('function');
    expect(typeof review.buildReviewRequest).toBe('function');
  });

  it('exposes the boundary, budget, and error helpers', () => {
    expect(typeof review.buildScope).toBe('function');
    expect(typeof review.enforceBudget).toBe('function');
    expect(typeof review.normalizeReviewUri).toBe('function');
    expect(review.BudgetExceededError).toBeDefined();
  });

  it('exposes the Zod schemas for every external shape', () => {
    expect(review.REVIEW_TARGET_SCHEMA).toBeDefined();
    expect(review.REVIEW_RULE_SCHEMA).toBeDefined();
    expect(review.REVIEW_CONTEXT_SCHEMA).toBeDefined();
    expect(review.REVIEW_BUDGET_SCHEMA).toBeDefined();
    expect(review.REVIEW_OUTPUT_POLICY_SCHEMA).toBeDefined();
    expect(review.REVIEW_FINDING_SCHEMA).toBeDefined();
    expect(review.REVIEW_SCORE_SCHEMA).toBeDefined();
    expect(review.REVIEW_DIAGNOSTIC_SCHEMA).toBeDefined();
    expect(review.REVIEW_USAGE_SCHEMA).toBeDefined();
    expect(review.REVIEW_RESULT_SCHEMA).toBeDefined();
    expect(review.REVIEW_REQUEST_SCHEMA).toBeDefined();
  });
});
