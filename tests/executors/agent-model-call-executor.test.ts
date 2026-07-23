import { describe, expect, it } from 'vitest';

import { AgentModelCallExecutor } from '../../src/executors/agent-model-call-executor';
import { DEFAULT_REVIEW_BUDGET } from '../../src/review';
import type { ReviewRequest, ReviewRule, ReviewTarget } from '../../src/review';
import { DefaultRequestBuilder } from '../../src/providers/request-builder';
import type { ToolCallDefinition, ToolCallingModelClient, ToolCallRunOptions } from '../../src/providers/tool-calling-model-client';
import type { LLMResult } from '../../src/providers/structured-model-client';
import type { TokenUsage } from '../../src/providers/token-usage';
import type { ReviewLLMResult } from '../../src/prompts/schema';
import type { TargetSectionErrorResult, TargetSectionResult } from '../../src/executors/target-read-capability-adapter';

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

type ModelViolation = ReviewLLMResult['violations'][number];

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

interface CapturedCall {
  systemPrompt: string;
  prompt: string;
  tools: Record<string, ToolCallDefinition>;
  options?: ToolCallRunOptions;
}

interface FakeToolClient extends ToolCallingModelClient {
  calls: number;
  captured: CapturedCall[];
}

function makeFakeClient(
  respond: () => { data: ReviewLLMResult; usage?: TokenUsage },
): FakeToolClient {
  const fake = {
    calls: 0,
    captured: [] as CapturedCall[],
    runWithTools: <T = unknown>(
      params: {
        systemPrompt: string;
        prompt: string;
        tools: Record<string, ToolCallDefinition>;
        schema: { name: string; schema: Record<string, unknown> };
        options?: ToolCallRunOptions;
      },
    ): Promise<LLMResult<T>> => {
      fake.calls += 1;
      fake.captured.push({
        systemPrompt: params.systemPrompt,
        prompt: params.prompt,
        tools: params.tools,
        ...(params.options !== undefined ? { options: params.options } : {}),
      });
      const { data, usage } = respond();
      const result: LLMResult<T> = { data: data as unknown as T };
      if (usage) {
        result.usage = usage;
      }
      return Promise.resolve(result);
    },
  };
  return fake;
}

const TARGET: ReviewTarget = {
  uri: 'file:///repo/docs/guide.md',
  content: 'vague text here\nsecond line is fine\nthird line\n',
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
    modelCall: 'agent',
    ...overrides,
  };
}

describe('AgentModelCallExecutor', () => {
  it('exposes exactly one tool (read_target_section) and projects findings/scores through processFindings', async () => {
    const client = makeFakeClient(() => ({
      data: {
        reasoning: 'r',
        violations: [modelViolation({ quoted_text: 'vague text', message: 'Too vague.' })],
      },
    }));
    const executor = new AgentModelCallExecutor(client, new DefaultRequestBuilder());

    const result = await executor.run(makeRequest([makeRule()]));

    // Exactly one bounded model run, exposing exactly one tool.
    expect(client.calls).toBe(1);
    expect(Object.keys(client.captured[0]!.tools)).toEqual(['read_target_section']);

    // The finding is verified + anchored through the shared processor.
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.ruleId).toBe('VectorLint.PseudoAdvice');
    expect(result.findings[0]?.ruleSource).toBe('/repo/presets/VectorLint/pseudo-advice.md');
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
    const executor = new AgentModelCallExecutor(client, new DefaultRequestBuilder());

    const result = await executor.run(makeRequest([makeRule()]));

    expect(result.findings).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('finding-evidence-not-locatable');
    expect(result.diagnostics[0]?.level).toBe('warn');
    expect(result.hadOperationalErrors).toBe(false);
  });

  it('passes the source-backed rule body verbatim as the system prompt (no model-supplied rule override)', async () => {
    const client = makeFakeClient(() => ({
      data: { reasoning: 'r', violations: [] },
    }));
    const executor = new AgentModelCallExecutor(client, new DefaultRequestBuilder());

    await executor.run(makeRequest([makeRule({ body: 'Flag vague advice.' })]));

    // With an empty directive/user-instructions builder, the system prompt is
    // the rule body verbatim — no model-supplied rule override is introduced.
    expect(client.captured[0]!.systemPrompt).toBe('Flag vague advice.');
    // The agent instruction names the only tool and the target.
    expect(client.captured[0]!.prompt).toContain('read_target_section');
    expect(client.captured[0]!.prompt).toContain('file:///repo/docs/guide.md');
  });

  it('includes caller-supplied context in the system prompt', async () => {
    const client = makeFakeClient(() => ({
      data: { reasoning: 'r', violations: [] },
    }));
    const executor = new AgentModelCallExecutor(client, new DefaultRequestBuilder());

    await executor.run(makeRequest([makeRule()], {
      context: [{
        label: 'Current API contract',
        relation: 'reference',
        content: 'The endpoint returns HTTP 202.',
      }],
    }));

    expect(client.captured[0]!.systemPrompt).toContain('## Caller-supplied context');
    expect(client.captured[0]!.systemPrompt).toContain('### Current API contract');
    expect(client.captured[0]!.systemPrompt).toContain('The endpoint returns HTTP 202.');
  });

  it('stops and records an operational error when the model-call budget is exhausted', async () => {
    const client = makeFakeClient(() => ({
      data: { reasoning: 'r', violations: [] },
    }));
    const executor = new AgentModelCallExecutor(client, new DefaultRequestBuilder());

    const result = await executor.run(
      makeRequest(
        [makeRule({ id: 'VectorLint.RuleA' }), makeRule({ id: 'VectorLint.RuleB' })],
        { budget: { ...DEFAULT_REVIEW_BUDGET, maxModelCallsPerReview: 1 } },
      ),
    );

    // Only the first rule's run fits within maxModelCallsPerReview = 1.
    expect(client.calls).toBe(1);
    expect(result.usage?.modelCalls).toBe(1);
    expect(result.hadOperationalErrors).toBe(true);
    expect(result.diagnostics.some((d) => d.code === 'review-budget-exceeded')).toBe(true);
    // The completed rule is still projected; the budget-exceeded rule is not.
    expect(result.scores).toHaveLength(1);
    expect(result.scores[0]?.ruleId).toBe('VectorLint.RuleA');
  });

  it('reviews each rule independently and aggregates usage across runs', async () => {
    const client = makeFakeClient(() => ({
      data: {
        reasoning: 'r',
        violations: [modelViolation({ quoted_text: 'vague text' })],
      },
      usage: { inputTokens: 10, outputTokens: 5 },
    }));
    const executor = new AgentModelCallExecutor(client, new DefaultRequestBuilder());

    const result = await executor.run(
      makeRequest([
        makeRule({ id: 'VectorLint.RuleA', source: '/repo/a.md' }),
        makeRule({ id: 'VectorLint.RuleB', source: '/repo/b.md' }),
      ]),
    );

    expect(client.calls).toBe(2);
    expect(result.scores.map((s) => s.ruleId).sort()).toEqual(['VectorLint.RuleA', 'VectorLint.RuleB']);
    expect(result.usage?.modelCalls).toBe(2);
    expect(result.usage?.inputTokens).toBe(20);
    expect(result.usage?.outputTokens).toBe(10);
  });

  it('exposes a read_target_section that slices only request.target.content', async () => {
    const client = makeFakeClient(() => ({ data: { reasoning: 'r', violations: [] } }));
    const executor = new AgentModelCallExecutor(client, new DefaultRequestBuilder());

    await executor.run(makeRequest([makeRule()]));

    const tool = client.captured[0]!.tools['read_target_section']!;
    const result = (await tool.execute({ startLine: 2, endLine: 3 })) as TargetSectionResult;

    // The window matches the in-memory target lines with their real line numbers.
    expect(result).toEqual({
      startLine: 2,
      endLine: 3,
      content: '2\tsecond line is fine\n3\tthird line',
    });
  });

  it('returns a model-visible error for out-of-range windows without aborting the run', async () => {
    const client = makeFakeClient(() => ({ data: { reasoning: 'r', violations: [] } }));
    const executor = new AgentModelCallExecutor(client, new DefaultRequestBuilder());

    // The run completes and returns a normal ReviewResult despite the model
    // (simulated below) requesting an out-of-range section.
    const result = await executor.run(makeRequest([makeRule()]));
    expect(result.hadOperationalErrors).toBe(false);

    const tool = client.captured[0]!.tools['read_target_section']!;
    const errorResult = (await tool.execute({ startLine: 1, endLine: 999 })) as TargetSectionErrorResult;

    expect(errorResult.error).toContain('999');
    expect(errorResult.lineCount).toBe(4);
  });

  it('bounds each run by the budget maxChunksPerRule step limit', async () => {
    const client = makeFakeClient(() => ({ data: { reasoning: 'r', violations: [] } }));
    const executor = new AgentModelCallExecutor(client, new DefaultRequestBuilder());

    await executor.run(
      makeRequest([makeRule()], { budget: { ...DEFAULT_REVIEW_BUDGET, maxChunksPerRule: 7 } }),
    );

    expect(client.captured[0]!.options?.maxSteps).toBe(7);
    expect(client.captured[0]!.options?.maxParallelToolCalls).toBe(1);
  });
});
