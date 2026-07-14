import { describe, expect, it } from 'vitest';
import type { LanguageModel } from 'ai';
import type {
  LLMResult,
  StructuredModelClient,
} from '../../src/providers/structured-model-client';
import { VercelAIProvider } from '../../src/providers/vercel-ai-provider';

const SCHEMA = { name: 'Schema', schema: { type: 'object' } };

describe('StructuredModelClient contract', () => {
  it('exposes runPromptStructured and returns an LLMResult', async () => {
    const client: StructuredModelClient = {
      runPromptStructured: () => Promise.resolve({ data: { ok: true } }),
    };

    expect(typeof client.runPromptStructured).toBe('function');

    const result = await client.runPromptStructured('content', 'prompt', SCHEMA);
    expect(result.data).toEqual({ ok: true });
    expect(result.usage).toBeUndefined();
  });

  it('carries optional token usage on LLMResult', async () => {
    const client: StructuredModelClient = {
      runPromptStructured: () =>
        Promise.resolve({ data: 1, usage: { inputTokens: 3, outputTokens: 4 } }),
    };

    const result: LLMResult<number> = await client.runPromptStructured(
      'content',
      'prompt',
      SCHEMA,
    );

    expect(result.data).toBe(1);
    expect(result.usage).toEqual({ inputTokens: 3, outputTokens: 4 });
  });

  it('does not declare an autonomous agent-loop method', () => {
    // Compile-time guard: the capability surface is exactly runPromptStructured.
    // If a second member were added, this conditional type would resolve to
    // `false` and the assignment below would fail tsc.
    type StructuredKeys = keyof StructuredModelClient;
    const onlyRunPromptStructured: StructuredKeys extends 'runPromptStructured' ? true : false = true;
    expect(onlyRunPromptStructured).toBe(true);

    // Runtime guard: a minimal implementation exposes only runPromptStructured.
    const client: StructuredModelClient = {
      runPromptStructured: () => Promise.resolve({ data: null }),
    };
    expect(
      (client as unknown as Record<string, unknown>).runAgentToolLoop,
    ).toBeUndefined();
  });

  it('is satisfied by VercelAIProvider', () => {
    const provider = new VercelAIProvider({
      model: {} as unknown as LanguageModel,
    });

    // Type-level assignability is enforced by this assignment (tsc fails if
    // VercelAIProvider does not satisfy StructuredModelClient).
    const client: StructuredModelClient = provider;
    expect(typeof client.runPromptStructured).toBe('function');
  });
});
