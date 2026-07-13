import { describe, expect, it } from 'vitest';
import {
  REVIEW_MODEL_CALLS,
  chooseModelCall,
  type ReviewExecutor,
  type ReviewRequest,
} from '../../src/review';

describe('REVIEW_MODEL_CALLS', () => {
  it('exposes single | agent | auto', () => {
    expect(REVIEW_MODEL_CALLS).toEqual(['single', 'agent', 'auto']);
  });
});

describe('chooseModelCall', () => {
  it('respects an explicit single call', () => {
    expect(chooseModelCall('single', { targetBytes: 2_000_000, rules: 10 })).toBe('single');
  });

  it('respects an explicit agent call', () => {
    expect(chooseModelCall('agent', { targetBytes: 10, rules: 1 })).toBe('agent');
  });

  it('returns single for small inputs under auto', () => {
    expect(chooseModelCall('auto', { targetBytes: 10_000, rules: 1 })).toBe('single');
  });

  it('returns agent for large inputs under auto', () => {
    expect(chooseModelCall('auto', { targetBytes: 2_000_000, rules: 1 })).toBe('agent');
  });

  it('returns agent for many rules under auto', () => {
    expect(chooseModelCall('auto', { targetBytes: 1_000, rules: 6 })).toBe('agent');
  });
});

describe('ReviewExecutor contract', () => {
  it('can be implemented and run() returns a ReviewResult', async () => {
    const fake: ReviewExecutor = {
      run: () => Promise.resolve({ findings: [], scores: [], diagnostics: [] }),
    };
    const result = await fake.run({} as unknown as ReviewRequest);
    expect(result.findings).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });
});
