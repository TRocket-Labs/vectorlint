import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { LanguageModel } from 'ai';
import { createMockLogger } from '../utils';

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
          execute: () => Promise.resolve({ ok: true }),
        },
      },
    });

    const call = MOCK_GENERATE_TEXT.mock.calls.at(-1)?.[0] as {
      maxRetries?: number;
    };

    expect(call.maxRetries).toBe(4);
  });

  it('limits concurrent tool executes to maxParallelToolCalls', async () => {
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    MOCK_GENERATE_TEXT.mockImplementation(async (args: Record<string, unknown>) => {
      const tools = args.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
      await Promise.all(Object.values(tools).map((t) => t.execute({})));
      return { text: 'done', usage: { inputTokens: 10, outputTokens: 5 } };
    });

    const trackingExecute = async () => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      currentConcurrent--;
      return {};
    };

    const provider = new VercelAIProvider({
      model: { provider: 'openai' } as unknown as LanguageModel,
    });

    await provider.runAgentToolLoop({
      systemPrompt: 'system',
      prompt: 'prompt',
      maxParallelToolCalls: 2,
      tools: {
        tool_a: { description: 'a', inputSchema: z.object({}), execute: trackingExecute },
        tool_b: { description: 'b', inputSchema: z.object({}), execute: trackingExecute },
        tool_c: { description: 'c', inputSchema: z.object({}), execute: trackingExecute },
        tool_d: { description: 'd', inputSchema: z.object({}), execute: trackingExecute },
      },
    });

    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(maxConcurrent).toBeGreaterThan(1);
  });

  it('defaults tool concurrency to 1 when maxParallelToolCalls is not supplied', async () => {
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    MOCK_GENERATE_TEXT.mockImplementation(async (args: Record<string, unknown>) => {
      const tools = args.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
      await Promise.all(Object.values(tools).map((t) => t.execute({})));
      return { text: 'done', usage: { inputTokens: 10, outputTokens: 5 } };
    });

    const trackingExecute = async () => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      currentConcurrent--;
      return {};
    };

    const provider = new VercelAIProvider({
      model: { provider: 'openai' } as unknown as LanguageModel,
    });

    await provider.runAgentToolLoop({
      systemPrompt: 'system',
      prompt: 'prompt',
      tools: {
        tool_a: { description: 'a', inputSchema: z.object({}), execute: trackingExecute },
        tool_b: { description: 'b', inputSchema: z.object({}), execute: trackingExecute },
        tool_c: { description: 'c', inputSchema: z.object({}), execute: trackingExecute },
      },
    });

    expect(maxConcurrent).toBe(1);
  });

  it('emits agent-loop debug output through the injected logger', async () => {
    MOCK_GENERATE_TEXT.mockResolvedValue({
      text: 'final summary',
      finishReason: 'stop',
      steps: [
        {
          finishReason: 'tool-calls',
          text: 'step text',
          toolCalls: [{ toolName: 'lint' }],
        },
      ],
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const logger = createMockLogger();

    const provider = new VercelAIProvider({
      model: { provider: 'openai' } as unknown as LanguageModel,
      debug: true,
      logger,
    });

    await provider.runAgentToolLoop({
      systemPrompt: 'system',
      prompt: 'prompt',
      tools: {
        finalize_review: {
          description: 'Finalize review session',
          inputSchema: z.object({ summary: z.string().optional() }),
          execute: () => Promise.resolve({ ok: true }),
        },
      },
    });

    expect(logger.debug).toHaveBeenCalled();
    expect(
      logger.debug.mock.calls.some(([message]) =>
        String(message).includes('[agent] step 1: finishReason=tool-calls tools=[lint]')
      )
    ).toBe(true);
    expect(
      logger.debug.mock.calls.some(([message]) =>
        String(message).includes('[agent] final finishReason=stop steps=1')
      )
    ).toBe(true);
  });
});
