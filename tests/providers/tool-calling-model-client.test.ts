import { describe, expect, it } from 'vitest';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import type {
  ToolCallDefinition,
  ToolCallRunOptions,
  ToolCallingModelClient,
} from '../../src/providers/tool-calling-model-client';
import { VercelAIProvider } from '../../src/providers/vercel-ai-provider';

const SCHEMA = { name: 'Findings', schema: { type: 'object' } };

describe('ToolCallingModelClient contract', () => {
  it('exposes a single bounded runWithTools method', () => {
    // Compile-time guard: the capability surface is exactly runWithTools.
    type ToolCallingKeys = keyof ToolCallingModelClient;
    const onlyRunWithTools: ToolCallingKeys extends 'runWithTools' ? true : false = true;
    expect(onlyRunWithTools).toBe(true);

    const client: ToolCallingModelClient = {
      runWithTools: () => Promise.resolve({ data: { findings: [] } }),
    };
    expect(typeof client.runWithTools).toBe('function');
  });

  it('returns structured output plus optional usage', async () => {
    const client: ToolCallingModelClient = {
      runWithTools: () =>
        Promise.resolve({
          data: { findings: [{ line: 1 }] },
          usage: { inputTokens: 5, outputTokens: 6 },
        }),
    };

    const result = await client.runWithTools({
      systemPrompt: 'system',
      prompt: 'prompt',
      tools: { read: makeTool() },
      schema: SCHEMA,
      options: { maxSteps: 3, maxParallelToolCalls: 1 } satisfies ToolCallRunOptions,
    });

    expect(result.data).toEqual({ findings: [{ line: 1 }] });
    expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 6 });
  });

  it('accepts executor-owned tool definitions with typed parameters', () => {
    const parameters = z.object({ startLine: z.number().int().positive() });
    const definition: ToolCallDefinition = {
      description: 'paged read',
      parameters,
      execute: (input) => Promise.resolve(input),
    };

    expect(definition.parameters).toBe(parameters);
    expect(typeof definition.execute).toBe('function');
  });

  it('does not name workspace-agent or product-finding concepts on the capability surface', () => {
    const client: ToolCallingModelClient = {
      runWithTools: () => Promise.resolve({ data: {} }),
    };
    const keys = Object.keys(client as Record<string, unknown>);

    const forbidden = [
      'read_file',
      'search_content',
      'report_finding',
    ];
    for (const concept of forbidden) {
      expect(keys).not.toContain(concept);
    }
  });

  it('is satisfied by VercelAIProvider', () => {
    const provider = new VercelAIProvider({
      model: {} as unknown as LanguageModel,
    });

    // Type-level assignability is enforced by this assignment (tsc fails if
    // VercelAIProvider does not satisfy ToolCallingModelClient).
    const client: ToolCallingModelClient = provider;
    expect(typeof client.runWithTools).toBe('function');
  });
});

function makeTool(): ToolCallDefinition {
  return {
    description: 'a bounded executor-owned tool',
    parameters: z.object({ value: z.number().int().positive() }),
    execute: () => Promise.resolve({ ok: true }),
  };
}
