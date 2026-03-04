import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';


// Mock the Vercel AI SDK — use vi.hoisted so the mock is available in the vi.mock factory
const MOCK_GENERATE_TEXT = vi.hoisted(() => vi.fn());

// Hoist error class for NoObjectGeneratedError
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

// Mock Vercel AI SDK - must come before importing SUT
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
  };
});

// Import SUT after mocks are set up
import { VercelAIProvider, type VercelAIConfig } from '../src/providers/vercel-ai-provider';
import { DefaultRequestBuilder, type RequestBuilder } from '../src/providers/request-builder';
import type { LanguageModel } from 'ai';

// Mock model stub — only stored in config and passed through to the mocked
// generateText function, so it doesn't need to implement the full interface.
const MOCK_MODEL = {} as unknown as LanguageModel;

describe('VercelAIProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('creates provider with required config', () => {
      const config: VercelAIConfig = {
        model: MOCK_MODEL, // Mock LanguageModel
      };

      const provider = new VercelAIProvider(config);
      expect(provider).toBeInstanceOf(VercelAIProvider);
    });

    it('applies default temperature when not provided', async () => {
      const config: VercelAIConfig = {
        model: MOCK_MODEL,
      };

      const mockResult = { output: { result: 'ok' } };
      MOCK_GENERATE_TEXT.mockResolvedValue(mockResult);

      const provider = new VercelAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } }, type: 'object' },
      };

      await provider.runPromptStructured('content', 'prompt', schema);

      expect(MOCK_GENERATE_TEXT).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0.2 })
      );
    });

    it('accepts custom request builder', () => {
      const config: VercelAIConfig = {
        model: MOCK_MODEL,
      };
      const customBuilder = new DefaultRequestBuilder('custom directive');

      expect(() => new VercelAIProvider(config, customBuilder)).not.toThrow();
    });

    it('accepts all configuration options', () => {
      const config: VercelAIConfig = {
        model: MOCK_MODEL,
        temperature: 0.7,
        debug: true,
        showPrompt: true,
        showPromptTrunc: false,
      };

      expect(() => new VercelAIProvider(config)).not.toThrow();
    });
  });

  describe('Structured Response Handling', () => {
    it('successfully parses structured JSON response', async () => {
      const config: VercelAIConfig = {
        model: MOCK_MODEL,
      };

      const mockOutput = {
        score: 85,
        feedback: 'Good content',
      };

      const mockResult = {
        output: mockOutput,
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        },
        finishReason: 'stop',
      };

      MOCK_GENERATE_TEXT.mockResolvedValue(mockResult);

      const provider = new VercelAIProvider(config);
      const schema = {
        name: 'submit_evaluation',
        schema: {
          properties: {
            score: { type: 'number' },
            feedback: { type: 'string' },
          },
          required: ['score', 'feedback'],
          type: 'object',
        },
      };

      const result = await provider.runPromptStructured(
        'Test content',
        'Test prompt',
        schema
      );

      expect(result.data).toEqual({
        score: 85,
        feedback: 'Good content',
      });

      expect(result.usage).toBeDefined();
      if (result.usage) {
        expect(result.usage.inputTokens).toBe(100);
        expect(result.usage.outputTokens).toBe(50);
      }
    });

    it('configures Vercel AI SDK with Output.object()', async () => {
      const config: VercelAIConfig = {
        model: MOCK_MODEL,
      };

      const mockResult = {
        output: { result: 'success' },
      };

      MOCK_GENERATE_TEXT.mockResolvedValue(mockResult);

      const provider = new VercelAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: {
          properties: {
            result: { type: 'string' },
          },
          required: ['result'],
          type: 'object',
        },
      };

      await provider.runPromptStructured('Test content', 'Test prompt', schema);

      expect(MOCK_GENERATE_TEXT).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.any(String) as string,
          prompt: 'Input:\n\nTest content',
          temperature: 0.2,
          output: expect.objectContaining({
            _outputType: 'object',
          }) as Record<string, unknown>,
        })
      );
    });

    it('includes temperature in API call when configured', async () => {
      const config: VercelAIConfig = {
        model: MOCK_MODEL,
        temperature: 0.7,
      };

      const mockResult = { output: { result: 'success' } };
      MOCK_GENERATE_TEXT.mockResolvedValue(mockResult);

      const provider = new VercelAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } }, type: 'object' },
      };

      await provider.runPromptStructured('Test content', 'Test prompt', schema);

      expect(MOCK_GENERATE_TEXT).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('handles NoObjectGeneratedError', async () => {
      const config: VercelAIConfig = {
        model: MOCK_MODEL,
      };

      const { NoObjectGeneratedError } = ERROR_CLASSES;
      MOCK_GENERATE_TEXT.mockRejectedValue(
        new NoObjectGeneratedError('Failed to generate object', 'Raw text here')
      );

      const provider = new VercelAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } }, type: 'object' },
      };

      await expect(
        provider.runPromptStructured('Test content', 'Test prompt', schema)
      ).rejects.toThrow('LLM failed to generate valid structured output');
    });

    it('handles unknown errors', async () => {
      const config: VercelAIConfig = {
        model: MOCK_MODEL,
      };

      MOCK_GENERATE_TEXT.mockRejectedValue(new Error('Unknown error'));

      const provider = new VercelAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } }, type: 'object' },
      };

      await expect(
        provider.runPromptStructured('Test content', 'Test prompt', schema)
      ).rejects.toThrow('Vercel AI SDK call failed: Unknown error');
    });
  });

  describe('Debugging and Logging', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('logs debug information when debug is enabled', async () => {
      const config: VercelAIConfig = {
        model: MOCK_MODEL,
        debug: true,
      };

      const mockResult = {
        output: { result: 'success' },
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        },
        finishReason: 'stop',
      };

      MOCK_GENERATE_TEXT.mockResolvedValue(mockResult);

      const provider = new VercelAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } }, type: 'object' },
      };

      await provider.runPromptStructured('Test content', 'Test prompt', schema);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[vectorlint] Sending request via Vercel AI SDK:',
        expect.any(Object)
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        '[vectorlint] LLM response meta:',
        expect.objectContaining({
          usage: expect.objectContaining({
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          }) as Record<string, unknown>,
        })
      );
    });

    it('does not log when debug is disabled', async () => {
      const config: VercelAIConfig = {
        model: MOCK_MODEL,
        debug: false,
      };

      const mockResult = { output: { result: 'success' } };
      MOCK_GENERATE_TEXT.mockResolvedValue(mockResult);

      const provider = new VercelAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } }, type: 'object' },
      };

      await provider.runPromptStructured('Test content', 'Test prompt', schema);

      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('Request Building', () => {
    it('uses request builder to build system prompt', async () => {
      const config: VercelAIConfig = {
        model: MOCK_MODEL,
      };

      const mockResult = { output: { result: 'success' } };
      MOCK_GENERATE_TEXT.mockResolvedValue(mockResult);

      const buildPromptBodyForStructuredFn = vi.fn().mockReturnValue('Built system prompt');
      const mockBuilder: RequestBuilder = {
        buildPromptBodyForStructured: buildPromptBodyForStructuredFn,
      };

      const provider = new VercelAIProvider(config, mockBuilder);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } }, type: 'object' },
      };

      await provider.runPromptStructured('Test content', 'Test prompt', schema);

      expect(buildPromptBodyForStructuredFn).toHaveBeenCalledWith('Test prompt', undefined);

      expect(MOCK_GENERATE_TEXT).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'Built system prompt',
          prompt: 'Input:\n\nTest content',
        })
      );
    });
  });

  describe('JSON Schema to Zod Conversion', () => {
    it('converts simple string properties', async () => {
      const config: VercelAIConfig = {
        model: MOCK_MODEL,
      };

      const mockResult = { output: { name: 'test' } };
      MOCK_GENERATE_TEXT.mockResolvedValue(mockResult);

      const provider = new VercelAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: {
          properties: {
            name: { type: 'string' },
          },
          required: ['name'] as string[],
          type: 'object',
        },
      };

      const result = await provider.runPromptStructured('Test content', 'Test prompt', schema);
      expect(result.data).toEqual({ name: 'test' });
    });

    it('converts number properties', async () => {
      const config: VercelAIConfig = {
        model: MOCK_MODEL,
      };

      const mockResult = { output: { score: 42 } };
      MOCK_GENERATE_TEXT.mockResolvedValue(mockResult);

      const provider = new VercelAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: {
          properties: {
            score: { type: 'number' },
          },
          required: ['score'] as string[],
          type: 'object',
        },
      };

      const result = await provider.runPromptStructured('Test content', 'Test prompt', schema);
      expect(result.data).toEqual({ score: 42 });
    });

    it('handles optional fields', async () => {
      const config: VercelAIConfig = {
        model: MOCK_MODEL,
      };

      const mockResult = { output: { requiredField: 'value' } };
      MOCK_GENERATE_TEXT.mockResolvedValue(mockResult);

      const provider = new VercelAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: {
          properties: {
            requiredField: { type: 'string' },
            optionalField: { type: 'string' },
          },
          required: ['requiredField'] as string[],
          type: 'object',
        },
      };

      const result = await provider.runPromptStructured('Test content', 'Test prompt', schema);
      expect(result.data).toEqual({ requiredField: 'value' });
    });

    it('converts union type arrays (e.g. [string, number])', async () => {
      const config: VercelAIConfig = {
        model: MOCK_MODEL,
      };

      const mockResult = { output: { value: 'hello' } };
      MOCK_GENERATE_TEXT.mockResolvedValue(mockResult);

      const provider = new VercelAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: {
          properties: {
            value: { type: ['string', 'number'] },
          },
          required: ['value'] as string[],
          type: 'object',
        },
      };

      const result = await provider.runPromptStructured('Test content', 'Test prompt', schema);
      expect(result.data).toEqual({ value: 'hello' });
    });

    it('handles nullable types (e.g. [null, string])', async () => {
      const config: VercelAIConfig = {
        model: MOCK_MODEL,
      };

      const mockResult = { output: { name: null } };
      MOCK_GENERATE_TEXT.mockResolvedValue(mockResult);

      const provider = new VercelAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: {
          properties: {
            name: { type: ['null', 'string'] },
          },
          required: ['name'] as string[],
          type: 'object',
        },
      };

      const result = await provider.runPromptStructured('Test content', 'Test prompt', schema);
      expect(result.data).toEqual({ name: null });
    });
  });
});
