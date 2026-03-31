import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { LanguageModel } from 'ai';

const MOCK_GENERATE_TEXT = vi.hoisted(() => vi.fn());
const MOCK_STEP_COUNT_IS = vi.hoisted(() => vi.fn(() => ({ type: 'stepCount' })));
const MOCK_TOOL = vi.hoisted(() =>
  vi.fn((definition: Record<string, unknown>) => definition)
);

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
    stepCountIs: MOCK_STEP_COUNT_IS,
    tool: MOCK_TOOL,
    Output: {
      object: vi.fn((schema: unknown) => ({
        _outputType: 'object',
        schema,
      })),
    },
    NoObjectGeneratedError,
  };
});

import { VercelAIProvider } from '../../src/providers/vercel-ai-provider';

describe('VercelAIProvider agent loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies configured retry and tool-concurrency limits during agent execution', async () => {
    MOCK_GENERATE_TEXT.mockResolvedValue({
      text: 'done',
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const provider = new VercelAIProvider({
      model: { provider: 'openai' } as unknown as LanguageModel,
    });

    const runAgentToolLoop = (
      provider as unknown as {
        runAgentToolLoop?: (params: Record<string, unknown>) => Promise<unknown>;
      }
    ).runAgentToolLoop;

    expect(typeof runAgentToolLoop).toBe('function');
    if (typeof runAgentToolLoop !== 'function') {
      throw new Error('runAgentToolLoop is not implemented');
    }

    await runAgentToolLoop({
      systemPrompt: 'system',
      prompt: 'prompt',
      maxRetries: 4,
      maxSteps: 42,
      maxParallelToolCalls: 1,
      tools: {
        finalize_review: {
          description: 'Finalize review session',
          inputSchema: z.object({ summary: z.string().optional() }),
          execute: async () => ({ ok: true }),
        },
      },
    });

    const call = MOCK_GENERATE_TEXT.mock.calls.at(-1)?.[0] as {
      maxRetries?: number;
      providerOptions?: Record<string, unknown>;
    };

    expect(call.maxRetries).toBe(4);
    expect(call.providerOptions).toEqual({
      openai: { parallelToolCalls: false },
    });
  });

  it('enables provider-level parallel tool calls when maxParallelToolCalls is greater than one', async () => {
    MOCK_GENERATE_TEXT.mockResolvedValue({
      text: 'done',
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const provider = new VercelAIProvider({
      model: { provider: 'openai' } as unknown as LanguageModel,
    });

    const runAgentToolLoop = (
      provider as unknown as {
        runAgentToolLoop?: (params: Record<string, unknown>) => Promise<unknown>;
      }
    ).runAgentToolLoop;

    expect(typeof runAgentToolLoop).toBe('function');
    if (typeof runAgentToolLoop !== 'function') {
      throw new Error('runAgentToolLoop is not implemented');
    }

    await runAgentToolLoop({
      systemPrompt: 'system',
      prompt: 'prompt',
      maxRetries: 4,
      maxSteps: 42,
      maxParallelToolCalls: 3,
      tools: {
        finalize_review: {
          description: 'Finalize review session',
          inputSchema: z.object({ summary: z.string().optional() }),
          execute: async () => ({ ok: true }),
        },
      },
    });

    const call = MOCK_GENERATE_TEXT.mock.calls.at(-1)?.[0] as {
      providerOptions?: Record<string, unknown>;
    };

    expect(call.providerOptions).toEqual({
      openai: { parallelToolCalls: true },
    });
  });

  it('keeps provider tool execution serial when maxParallelToolCalls is not supplied', async () => {
    MOCK_GENERATE_TEXT.mockResolvedValue({
      text: 'done',
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const provider = new VercelAIProvider({
      model: { provider: 'openai' } as unknown as LanguageModel,
    });

    const runAgentToolLoop = (
      provider as unknown as {
        runAgentToolLoop?: (params: Record<string, unknown>) => Promise<unknown>;
      }
    ).runAgentToolLoop;

    expect(typeof runAgentToolLoop).toBe('function');
    if (typeof runAgentToolLoop !== 'function') {
      throw new Error('runAgentToolLoop is not implemented');
    }

    await runAgentToolLoop({
      systemPrompt: 'system',
      prompt: 'prompt',
      maxRetries: 4,
      maxSteps: 42,
      tools: {
        finalize_review: {
          description: 'Finalize review session',
          inputSchema: z.object({ summary: z.string().optional() }),
          execute: async () => ({ ok: true }),
        },
      },
    });

    const call = MOCK_GENERATE_TEXT.mock.calls.at(-1)?.[0] as {
      providerOptions?: Record<string, unknown>;
    };

    expect(call.providerOptions).toEqual({
      openai: { parallelToolCalls: false },
    });
  });
});
