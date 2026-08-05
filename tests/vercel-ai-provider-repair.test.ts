import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Vercel AI SDK — use vi.hoisted so the mock is available in the vi.mock factory.
const MOCK_GENERATE_TEXT = vi.hoisted(() => vi.fn());

// Hoist the NoObjectGeneratedError class so it is available inside the mock
// factory and matches the isInstance() contract used by the provider.
const ERROR_CLASSES = vi.hoisted(() => {
  class NoObjectGeneratedError extends Error {
    text: string;
    constructor(message: string, text: string) {
      super(message);
      this.name = 'NoObjectGeneratedError';
      this.text = text;
    }
    static isInstance(error: unknown): error is NoObjectGeneratedError {
      return error instanceof NoObjectGeneratedError;
    }
  }
  return { NoObjectGeneratedError };
});

vi.mock('ai', () => {
  const { NoObjectGeneratedError } = ERROR_CLASSES;
  return {
    generateText: MOCK_GENERATE_TEXT,
    Output: {
      object: vi.fn((schema: unknown) => ({
        _outputType: 'object',
        schema,
      })),
    },
    NoObjectGeneratedError,
    // Pass-through stubs used by runWithTools() when building the request.
    stepCountIs: vi.fn((max: number) => ({ type: 'step-count', max })),
    tool: vi.fn((definition: unknown) => definition),
  };
});

import { VercelAIProvider, type VercelAIConfig } from '../src/providers/vercel-ai-provider';
import type { LanguageModel } from 'ai';

const MOCK_MODEL = {
  provider: 'openai',
  modelId: 'gpt-4o',
} as unknown as LanguageModel;

const REVIEW_SCHEMA = {
  name: 'submit_review',
  schema: {
    properties: {
      score: { type: 'number' },
      violations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            line: { type: 'number' },
            rule_quote: { type: 'string' },
            severity: { type: 'string' },
          },
          required: ['line', 'rule_quote', 'severity'],
        },
      },
    },
    required: ['score', 'violations'],
    type: 'object',
  },
} as const;

describe('VercelAIProvider structured output repair', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('repairs NoObjectGeneratedError text with double-encoded violations in runWithTools', async () => {
    const config: VercelAIConfig = { model: MOCK_MODEL };

    // The violations field is a *string* containing a JSON array with
    // unescaped internal quotes around "Let me be clear" and "Let that sink in".
    const innerViolations = '[\n  {\n    "line": 9,\n    "rule_quote": "**Performative emphasis**: Example: "Let me be clear" / "Let that sink in"",\n    "severity": "medium"\n  }\n]';
    // The outer payload itself is valid JSON; only the nested string is broken.
    const rawText = JSON.stringify({ score: 70, violations: innerViolations });

    const { NoObjectGeneratedError } = ERROR_CLASSES;
    MOCK_GENERATE_TEXT.mockRejectedValue(
      new NoObjectGeneratedError('Failed to generate object', rawText)
    );

    const provider = new VercelAIProvider(config);

    const result = await provider.runWithTools({
      systemPrompt: 'system',
      prompt: 'prompt',
      tools: {},
      schema: REVIEW_SCHEMA,
    });

    expect(result.data).toEqual({
      score: 70,
      violations: [
        {
          line: 9,
          rule_quote: '**Performative emphasis**: Example: "Let me be clear" / "Let that sink in"',
          severity: 'medium',
        },
      ],
    });
  });

  it('omits usage when the call rejects before usage is recorded', async () => {
    const config: VercelAIConfig = { model: MOCK_MODEL };

    const innerViolations = '[\n  {\n    "line": 9,\n    "rule_quote": "Example: "Let me be clear"",\n    "severity": "medium"\n  }\n]';
    const rawText = JSON.stringify({ score: 70, violations: innerViolations });

    const { NoObjectGeneratedError } = ERROR_CLASSES;
    // runWithTools reads only .text off the error. The provider assigns usage
    // after generateText resolves, so a rejection leaves usage undefined.
    const error = new NoObjectGeneratedError('Failed to generate object', rawText);
    MOCK_GENERATE_TEXT.mockRejectedValue(error);

    const provider = new VercelAIProvider(config);

    const result = await provider.runWithTools({
      systemPrompt: 'system',
      prompt: 'prompt',
      tools: {},
      schema: REVIEW_SCHEMA,
    });

    expect(result.usage).toBeUndefined();
    expect(result.data).toMatchObject({ score: 70 });
  });

  it('rethrows when repaired text fails schema validation', async () => {
    const config: VercelAIConfig = { model: MOCK_MODEL };

    // Inner JSON parses after repair, but the outer object is missing the
    // required `violations` field, so schema validation fails.
    const rawText = JSON.stringify({ unrelated: 'payload' });

    const { NoObjectGeneratedError } = ERROR_CLASSES;
    MOCK_GENERATE_TEXT.mockRejectedValue(
      new NoObjectGeneratedError('Failed to generate object', rawText)
    );

    const provider = new VercelAIProvider(config);

    await expect(
      provider.runWithTools({
        systemPrompt: 'system',
        prompt: 'prompt',
        tools: {},
        schema: REVIEW_SCHEMA,
      })
    ).rejects.toThrow('LLM failed to generate valid structured output');
  });

  it('repairs NoObjectGeneratedError text via runPromptStructured entrypoint', async () => {
    const config: VercelAIConfig = { model: MOCK_MODEL };

    const innerViolations = '[\n  {\n    "line": 9,\n    "rule_quote": "**Performative emphasis**: Example: "Let me be clear" / "Let that sink in"",\n    "severity": "medium"\n  }\n]';
    const rawText = JSON.stringify({ score: 70, violations: innerViolations });

    const { NoObjectGeneratedError } = ERROR_CLASSES;
    MOCK_GENERATE_TEXT.mockRejectedValue(
      new NoObjectGeneratedError('Failed to generate object', rawText)
    );

    const provider = new VercelAIProvider(config);

    const result = await provider.runPromptStructured('content', 'prompt text', REVIEW_SCHEMA);

    expect(result.data).toEqual({
      score: 70,
      violations: [
        {
          line: 9,
          rule_quote: '**Performative emphasis**: Example: "Let me be clear" / "Let that sink in"',
          severity: 'medium',
        },
      ],
    });
  });

  it('rethrows when raw text is not parseable JSON at all', async () => {
    const config: VercelAIConfig = { model: MOCK_MODEL };

    // Not valid JSON: repair cannot even parse the outer payload, so it
    // returns undefined and the NoObjectGeneratedError path rethrows.
    const rawText = 'not json at all';

    const { NoObjectGeneratedError } = ERROR_CLASSES;
    MOCK_GENERATE_TEXT.mockRejectedValue(
      new NoObjectGeneratedError('Failed to generate object', rawText)
    );

    const provider = new VercelAIProvider(config);

    await expect(
      provider.runWithTools({
        systemPrompt: 'system',
        prompt: 'prompt',
        tools: {},
        schema: REVIEW_SCHEMA,
      })
    ).rejects.toThrow('LLM failed to generate valid structured output');
  });

  it('fails safe when an inner string value ends with a trailing backslash', async () => {
    const config: VercelAIConfig = { model: MOCK_MODEL };

    // The model emits a rule_quote value whose intended content ends with a
    // single backslash, but forgets to escape it: `"prefix \"`. JSON then
    // reads the backslash as escaping the quote, so the string never closes.
    // The repair cannot recover the inner array, `violations` stays a string,
    // schema validation fails, and the call rethrows rather than returning
    // bogus data.
    const innerViolations = '[\n  {\n    "line": 9,\n    "rule_quote": "prefix \\"\n  }\n]';
    const rawText = JSON.stringify({ score: 70, violations: innerViolations });

    const { NoObjectGeneratedError } = ERROR_CLASSES;
    MOCK_GENERATE_TEXT.mockRejectedValue(
      new NoObjectGeneratedError('Failed to generate object', rawText)
    );

    const provider = new VercelAIProvider(config);

    await expect(
      provider.runWithTools({
        systemPrompt: 'system',
        prompt: 'prompt',
        tools: {},
        schema: REVIEW_SCHEMA,
      })
    ).rejects.toThrow('LLM failed to generate valid structured output');
  });
});
