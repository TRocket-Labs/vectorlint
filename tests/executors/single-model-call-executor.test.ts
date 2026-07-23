import { describe, expect, it } from 'vitest';

import { SingleModelCallExecutor } from '../../src/executors/single-model-call-executor';
import { DEFAULT_REVIEW_BUDGET } from '../../src/review';
import type {
  ReviewRequest,
  ReviewRule,
  ReviewTarget,
} from '../../src/review';
import type { LLMResult, StructuredModelClient } from '../../src/providers/structured-model-client';
import type { TokenUsage } from '../../src/providers/token-usage';
import type { EvaluationLLMResult } from '../../src/prompts/schema';

const SUPPORTED_CHECKS = {
  rule_supports_claim: true,
  evidence_exact: true,
  context_supports_violation: true,
  plausible_non_violation: false,
  fix_is_drop_in: true,
  fix_preserves_meaning: true,
};

const SUPPORTED_NOTES = {
  rule_supports_claim: 'yes',
  evidence_exact: 'yes',
  context_supports_violation: 'yes',
  plausible_non_violation: 'no',
  fix_is_drop_in: 'yes',
  fix_preserves_meaning: 'yes',
};

type ModelViolation = EvaluationLLMResult['violations'][number];

function modelViolation(overrides: Partial<ModelViolation> = {}): ModelViolation {
  return {
    line: 1,
    quoted_text: 'vague text',
    context_before: '',
    context_after: '',
    description: 'desc',
    analysis: 'analysis',
    message: 'message',
    suggestion: 'suggestion',
    fix: 'fix',
    rule_quote: 'rule quote',
    checks: SUPPORTED_CHECKS,
    check_notes: SUPPORTED_NOTES,
    confidence: 0.9,
    ...overrides,
  };
}

type FakeStructuredClient = StructuredModelClient & {
  runWithTools: () => Promise<never>;
  structuredCalls: number;
  toolCalls: number;
  lastPromptText?: string;
};

function makeFakeClient(
  respond: (content: string, promptText: string) => { data: EvaluationLLMResult; usage?: TokenUsage },
): FakeStructuredClient {
  const client = {
    structuredCalls: 0,
    toolCalls: 0,
    lastPromptText: undefined as string | undefined,
    runPromptStructured: <T = unknown>(
      content: string,
      promptText: string,
    ): Promise<LLMResult<T>> => {
      client.structuredCalls += 1;
      client.lastPromptText = promptText;
      const { data, usage } = respond(content, promptText);
      const result: LLMResult<T> = { data: data as unknown as T };
      if (usage) {
        result.usage = usage;
      }
      return Promise.resolve(result);
    },
    runWithTools: (): Promise<never> => {
      client.toolCalls += 1;
      return Promise.reject(
        new Error('SingleModelCallExecutor must not call runWithTools'),
      );
    },
  };
  return client;
}

const TARGET: ReviewTarget = {
  uri: 'file:///repo/docs/guide.md',
  content: 'vague text here\nsecond line is fine\n',
  contentType: 'text/markdown',
};

function makeRule(overrides: Partial<ReviewRule> = {}): ReviewRule {
  return {
    id: 'VectorLint.PseudoAdvice',
    source: '/repo/presets/VectorLint/pseudo-advice.md',
    body: 'Flag vague advice.',
    ...overrides,
  };
}

function makeRequest(rules: ReviewRule[], overrides: Partial<ReviewRequest> = {}): ReviewRequest {
  return {
    target: TARGET,
    rules,
    budget: { ...DEFAULT_REVIEW_BUDGET },
    outputPolicy: { includeUsage: true, recordPayloadTelemetry: false },
    modelCall: 'single',
    ...overrides,
  };
}

describe('SingleModelCallExecutor', () => {
  it('makes one structured call per rule and projects findings/scores through processFindings', async () => {
    const client = makeFakeClient(() => ({
      data: {
        reasoning: 'r',
        violations: [modelViolation({ quoted_text: 'vague text', message: 'Too vague.' })],
      },
    }));
    const executor = new SingleModelCallExecutor(client);

    const result = await executor.run(makeRequest([makeRule()]));

    // One structured call, with the rule body as the source-backed prompt.
    expect(client.structuredCalls).toBe(1);
    expect(client.lastPromptText).toBe('Flag vague advice.');

    // The finding is verified + anchored through the shared processor.
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.ruleId).toBe('VectorLint.PseudoAdvice');
    expect(result.findings[0]?.ruleSource).toBe('/repo/presets/VectorLint/pseudo-advice.md');
    expect(result.findings[0]?.line).toBeGreaterThanOrEqual(1);
    expect(result.findings[0]?.match).toBe('vague text');

    expect(result.scores).toHaveLength(1);
    expect(result.scores[0]?.ruleId).toBe('VectorLint.PseudoAdvice');
    expect(result.scores[0]?.findingCount).toBe(1);

    expect(result.usage?.modelCalls).toBe(1);
  });

  it('routes unanchored evidence to a warn diagnostic without emitting a finding', async () => {
    const client = makeFakeClient(() => ({
      data: {
        reasoning: 'r',
        violations: [modelViolation({ quoted_text: 'quantum entanglement device' })],
      },
    }));
    const executor = new SingleModelCallExecutor(client);

    const result = await executor.run(makeRequest([makeRule()]));

    expect(result.findings).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('finding-evidence-not-locatable');
    expect(result.diagnostics[0]?.level).toBe('warn');
    expect(result.hadOperationalErrors).toBe(false);
  });

  it('reviews each rule independently and aggregates usage across calls', async () => {
    const client = makeFakeClient(() => ({
      data: {
        reasoning: 'r',
        violations: [modelViolation({ quoted_text: 'vague text' })],
      },
      usage: { inputTokens: 10, outputTokens: 5 },
    }));
    const executor = new SingleModelCallExecutor(client);

    const result = await executor.run(
      makeRequest([
        makeRule({ id: 'VectorLint.RuleA', source: '/repo/a.md' }),
        makeRule({ id: 'VectorLint.RuleB', source: '/repo/b.md' }),
      ]),
    );

    expect(client.structuredCalls).toBe(2);
    expect(result.scores).toHaveLength(2);
    expect(result.scores.map((s) => s.ruleId).sort()).toEqual(['VectorLint.RuleA', 'VectorLint.RuleB']);
    expect(result.usage?.modelCalls).toBe(2);
    expect(result.usage?.inputTokens).toBe(20);
    expect(result.usage?.outputTokens).toBe(10);
  });

  it('stops and records an operational error when the model-call budget is exhausted', async () => {
    const client = makeFakeClient(() => ({
      data: { reasoning: 'r', violations: [] },
    }));
    const executor = new SingleModelCallExecutor(client);

    const result = await executor.run(
      makeRequest(
        [makeRule({ id: 'VectorLint.RuleA' }), makeRule({ id: 'VectorLint.RuleB' })],
        { budget: { ...DEFAULT_REVIEW_BUDGET, maxModelCallsPerReview: 1 } },
      ),
    );

    // Only the first rule's single call fits within maxModelCallsPerReview = 1.
    expect(client.structuredCalls).toBe(1);
    expect(result.usage?.modelCalls).toBe(1);
    expect(result.hadOperationalErrors).toBe(true);
    expect(result.diagnostics.some((d) => d.code === 'review-budget-exceeded')).toBe(true);
    // The completed rule is still projected; the budget-exceeded rule is not.
    expect(result.scores).toHaveLength(1);
    expect(result.scores[0]?.ruleId).toBe('VectorLint.RuleA');
  });

  it('never invokes the tool-calling surface', async () => {
    const client = makeFakeClient(() => ({
      data: { reasoning: 'r', violations: [] },
    }));
    const executor = new SingleModelCallExecutor(client);

    await executor.run(makeRequest([makeRule()]));

    expect(client.toolCalls).toBe(0);
    expect(client.structuredCalls).toBe(1);
  });

  it('chunks large targets into multiple model calls and merges per-chunk violations', async () => {
    // > 600 words triggers recursive chunking.
    const targetContent = Array.from({ length: 200 }, (_, i) => `vague text line ${i}`).join('\n');
    const client = makeFakeClient(() => ({
      data: {
        reasoning: 'r',
        violations: [modelViolation({ quoted_text: 'vague text line 0' })],
      },
    }));
    const executor = new SingleModelCallExecutor(client);

    const result = await executor.run(
      makeRequest([makeRule()], {
        target: { uri: 'file:///repo/docs/big.md', content: targetContent, contentType: 'text/markdown' },
      }),
    );

    expect(client.structuredCalls).toBeGreaterThan(1);
    expect(result.usage?.modelCalls).toBe(client.structuredCalls);
    expect(result.scores).toHaveLength(1);
    // Identical violations across chunks dedupe to a single anchored finding.
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.ruleId).toBe('VectorLint.PseudoAdvice');
  });
});
