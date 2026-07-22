import { describe, expect, it } from 'vitest';
import {
  BudgetExceededError,
  DEFAULT_REVIEW_BUDGET,
  REVIEW_BUDGET_SCHEMA,
  enforceBudget,
} from '../../src/review';
import { VectorlintError } from '../../src/errors';

describe('review budget defaults', () => {
  it('provides sensible positive defaults', () => {
    expect(DEFAULT_REVIEW_BUDGET.maxModelCallsPerReview).toBeGreaterThan(0);
    expect(DEFAULT_REVIEW_BUDGET.maxWallClockMs).toBeGreaterThan(0);
    expect(DEFAULT_REVIEW_BUDGET.maxTargetBytes).toBeGreaterThan(0);
  });
});

describe('REVIEW_BUDGET_SCHEMA', () => {
  it('applies defaults for omitted fields', () => {
    const parsed = REVIEW_BUDGET_SCHEMA.parse({ maxModelCallsPerReview: 5 });
    expect(parsed.maxWallClockMs).toBe(DEFAULT_REVIEW_BUDGET.maxWallClockMs);
    expect(parsed.maxModelCallsPerReview).toBe(5);
  });

  it('rejects non-positive limits', () => {
    expect(() => REVIEW_BUDGET_SCHEMA.parse({ maxModelCallsPerReview: 0 })).toThrow();
  });
});

describe('enforceBudget', () => {
  it('is silent within limits', () => {
    expect(() =>
      enforceBudget(DEFAULT_REVIEW_BUDGET, { modelCalls: 1, elapsedMs: 1000 }),
    ).not.toThrow();
  });

  it('throws BudgetExceededError when model calls exceed the limit', () => {
    expect(() =>
      enforceBudget(
        { ...DEFAULT_REVIEW_BUDGET, maxModelCallsPerReview: 3 },
        { modelCalls: 4, elapsedMs: 0 },
      ),
    ).toThrow(BudgetExceededError);
  });

  it('throws BudgetExceededError when wall clock exceeds the limit', () => {
    expect(() =>
      enforceBudget(
        { ...DEFAULT_REVIEW_BUDGET, maxWallClockMs: 100 },
        { modelCalls: 0, elapsedMs: 101 },
      ),
    ).toThrow(BudgetExceededError);
  });

  it('extends the repository error base', () => {
    const err = new BudgetExceededError('boom', 'maxModelCallsPerReview', 9);
    expect(err).toBeInstanceOf(VectorlintError);
    expect(err.limit).toBe('maxModelCallsPerReview');
    expect(err.actual).toBe(9);
    expect(err.code).toBe('BUDGET_EXCEEDED');
  });
});
