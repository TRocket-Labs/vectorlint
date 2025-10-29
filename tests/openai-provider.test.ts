import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { 
  MockAPIErrorParams, 
  MockAuthenticationErrorParams, 
  MockRateLimitErrorParams,
  MockOpenAIClient 
} from './schemas/mock-schemas';

// Shared spy used by all tests
const SHARED_CREATE = vi.fn();

// Hoist error classes to avoid TDZ issues
const ERRORS = vi.hoisted(() => {
  class APIError extends Error {
    status: number;
    constructor(params: MockAPIErrorParams) {
      super(params.message);
      this.name = 'APIError';
      this.status = params.status ?? 500;
    }
  }

  class AuthenticationError extends APIError {
    constructor(params: Partial<MockAuthenticationErrorParams> = {}) {
      super({
        message: params.message ?? 'Unauthorized',
        status: 401,
        options: params.options,
        body: params.body,
      });
      this.name = 'AuthenticationError';
    }
  }

  class RateLimitError extends APIError {
    constructor(params: Partial<MockRateLimitErrorParams> = {}) {
      super({
        message: params.message ?? 'Rate Limited',
        status: 429,
        options: params.options,
        body: params.body,
      });
      this.name = 'RateLimitError';
    }
  }

  return { APIError, AuthenticationError, RateLimitError };
});

// Mock OpenAI SDK - must come before importing SUT
vi.mock('openai', () => {
  // Pull hoisted classes so we reuse the same identities everywhere
  const { APIError, AuthenticationError, RateLimitError } = ERRORS;
  
  // Default export client with proper typing
  const openAI = vi.fn((): MockOpenAIClient => ({
    // Support either surface your provider might call
    chat: { completions: { create: SHARED_CREATE } },
    responses: { create: SHARED_CREATE },
  }));
  
  // Attach error classes on the default export too
  // @ts-expect-error - Mock needs to add error classes to constructor function
  openAI.APIError = APIError;
  // @ts-expect-error - Mock needs to add error classes to constructor function
  openAI.AuthenticationError = AuthenticationError;
  // @ts-expect-error - Mock needs to add error classes to constructor function
  openAI.RateLimitError = RateLimitError;
  
  // Some codebases read from OpenAI.errors.*
  // @ts-expect-error - Mock needs to add errors object to constructor function
  openAI.errors = {
    APIError,
    AuthenticationError,
    RateLimitError,
  };
  
  return {
    __esModule: true,
    default: openAI,
    // Also expose named exports in case the provider uses named imports
    APIError,
    AuthenticationError,
    RateLimitError,
  };
});

// Mock the API client validation
vi.mock('../src/boundaries/api-client', () => ({
  validateApiResponse: vi.fn(),
}));

// Now import SUT after mocks are set up
import { OpenAIProvider } from '../src/providers/openai-provider';
import { DefaultRequestBuilder } from '../src/providers/request-builder';
import type { OpenAIResponse } from '../src/schemas/api-schemas';

describe('OpenAIProvider', () => {
  let mockValidateApiResponse: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Get reference to the mocked validation function
    const apiClient = await import('../src/boundaries/api-client');
    mockValidateApiResponse = vi.mocked(apiClient.validateApiResponse);
    
    // Default mock behavior - return the response as-is
    mockValidateApiResponse.mockImplementation((response: unknown) => response as OpenAIResponse);
  });

  describe('Constructor', () => {
    it('creates provider with required config', () => {
      const config = {
        apiKey: 'sk-test-key',
      };

      const provider = new OpenAIProvider(config);
      expect(provider).toBeInstanceOf(OpenAIProvider);
    });

    it('applies default values for optional config', () => {
      const config = {
        apiKey: 'sk-test-key',
      };

      // Should not throw - defaults should be applied internally
      expect(() => new OpenAIProvider(config)).not.toThrow();
    });

    it('accepts custom request builder', () => {
      const config = {
        apiKey: 'sk-test-key',
      };
      const customBuilder = new DefaultRequestBuilder('custom directive');

      expect(() => new OpenAIProvider(config, customBuilder)).not.toThrow();
    });

    it('accepts all configuration options', () => {
      const config = {
        apiKey: 'sk-test-key',
        model: 'gpt-4o-mini',
        temperature: 0.5,
        debug: true,
        showPrompt: true,
        showPromptTrunc: false,
        debugJson: true,
      };

      expect(() => new OpenAIProvider(config)).not.toThrow();
    });
  });

  describe('Structured Response Handling', () => {
    it('successfully parses structured JSON response', async () => {
      const config = {
        apiKey: 'sk-test-key',
      };

      const mockResponse: OpenAIResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                score: 85,
                feedback: 'Good content',
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      SHARED_CREATE.mockResolvedValue(mockResponse);

      const provider = new OpenAIProvider(config);
      const schema = {
        name: 'submit_evaluation',
        schema: {
          properties: {
            score: { type: 'number' },
            feedback: { type: 'string' },
          },
          required: ['score', 'feedback'],
        },
      };

      const result = await provider.runPromptStructured(
        'Test content',
        'Test prompt',
        schema
      );

      expect(result).toEqual({
        score: 85,
        feedback: 'Good content',
      });
    });

    it('configures OpenAI API call with JSON schema response format', async () => {
      const config = {
        apiKey: 'sk-test-key',
      };

      const mockResponse: OpenAIResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ result: 'success' }),
            },
            finish_reason: 'stop',
          },
        ],
      };

      SHARED_CREATE.mockResolvedValue(mockResponse);

      const provider = new OpenAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: {
          properties: {
            result: { type: 'string' },
          },
          required: ['result'],
        },
      };

      await provider.runPromptStructured('Test content', 'Test prompt', schema);

      expect(SHARED_CREATE).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: expect.any(String) as string },
            { role: 'user', content: 'Input:\n\nTest content' },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'test_schema',
              schema: {
                properties: {
                  result: { type: 'string' },
                },
                required: ['result'],
              },
            },
          },
          temperature: 0.2,
        })
      );
    });

    it('properly formats complex JSON schema for OpenAI', async () => {
      const config = {
        apiKey: 'sk-test-key',
      };

      const mockResponse: OpenAIResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ 
                score: 85, 
                feedback: 'Good', 
                categories: ['content', 'style'] 
              }),
            },
            finish_reason: 'stop',
          },
        ],
      };

      SHARED_CREATE.mockResolvedValue(mockResponse);

      const provider = new OpenAIProvider(config);
      const complexSchema = {
        name: 'evaluation_result',
        schema: {
          type: 'object',
          properties: {
            score: { 
              type: 'number',
              minimum: 0,
              maximum: 100
            },
            feedback: { 
              type: 'string',
              minLength: 1
            },
            categories: {
              type: 'array',
              items: { type: 'string' }
            }
          },
          required: ['score', 'feedback'],
          additionalProperties: false
        },
      };

      await provider.runPromptStructured('Test content', 'Test prompt', complexSchema);

      const callArgs = SHARED_CREATE.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(callArgs?.response_format).toEqual({
        type: 'json_schema',
        json_schema: {
          name: 'evaluation_result',
          schema: complexSchema.schema,
        },
      });
    });

    it('includes temperature in API call when configured', async () => {
      const config = {
        apiKey: 'sk-test-key',
        temperature: 0.7,
      };

      const mockResponse: OpenAIResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ result: 'success' }),
            },
            finish_reason: 'stop',
          },
        ],
      };

      SHARED_CREATE.mockResolvedValue(mockResponse);

      const provider = new OpenAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } } },
      };

      await provider.runPromptStructured('Test content', 'Test prompt', schema);

      expect(SHARED_CREATE).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
        })
      );
    });

    it('uses default temperature when not explicitly configured', async () => {
      const config = {
        apiKey: 'sk-test-key',
      };

      const mockResponse: OpenAIResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ result: 'success' }),
            },
            finish_reason: 'stop',
          },
        ],
      };

      SHARED_CREATE.mockResolvedValue(mockResponse);

      const provider = new OpenAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } } },
      };

      await provider.runPromptStructured('Test content', 'Test prompt', schema);

      const callArgs = SHARED_CREATE.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(callArgs?.temperature).toBe(0.2); // Default temperature
    });

    it('uses default model when not explicitly configured', async () => {
      const config = {
        apiKey: 'sk-test-key',
      };

      const mockResponse: OpenAIResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ result: 'success' }),
            },
            finish_reason: 'stop',
          },
        ],
      };

      SHARED_CREATE.mockResolvedValue(mockResponse);

      const provider = new OpenAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } } },
      };

      await provider.runPromptStructured('Test content', 'Test prompt', schema);

      const callArgs = SHARED_CREATE.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(callArgs?.model).toBe('gpt-4o'); // Default model
    });

    it('uses custom model when configured', async () => {
      const config = {
        apiKey: 'sk-test-key',
        model: 'gpt-4o-mini',
      };

      const mockResponse: OpenAIResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ result: 'success' }),
            },
            finish_reason: 'stop',
          },
        ],
      };

      SHARED_CREATE.mockResolvedValue(mockResponse);

      const provider = new OpenAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } } },
      };

      await provider.runPromptStructured('Test content', 'Test prompt', schema);

      const callArgs = SHARED_CREATE.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(callArgs?.model).toBe('gpt-4o-mini');
    });
  });

  describe('Error Handling', () => {
    it('mock sanity check', async () => {
      const mod = await import('openai');
      // @ts-expect-error - Testing mock structure
      expect(mod.default.APIError).toBe(mod.APIError);
      // @ts-expect-error - Testing mock structure
      expect(typeof mod.default.APIError).toBe('function');
      expect(typeof new mod.default().chat.completions.create).toBe('function');
    });

    it('handles OpenAI API errors', async () => {
      const config = {
        apiKey: 'sk-test-key',
      };

      const openAI = await import('openai');
      // @ts-expect-error - Mock constructor signature differs from real SDK
      SHARED_CREATE.mockRejectedValue(new openAI.APIError({ 
        message: 'API request failed', 
        status: 429 
      }));

      const provider = new OpenAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } } },
      };

      await expect(
        provider.runPromptStructured('Test content', 'Test prompt', schema)
      ).rejects.toThrow('OpenAI API error (429): API request failed');
    });

    it('handles OpenAI rate limit errors', async () => {
      const config = {
        apiKey: 'sk-test-key',
      };

      const openAI = await import('openai');
      // @ts-expect-error - Mock constructor signature differs from real SDK
      SHARED_CREATE.mockRejectedValue(new openAI.RateLimitError({ 
        message: 'Rate limit exceeded' 
      }));

      const provider = new OpenAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } } },
      };

      await expect(
        provider.runPromptStructured('Test content', 'Test prompt', schema)
      ).rejects.toThrow('OpenAI rate limit exceeded: Rate limit exceeded');
    });

    it('handles OpenAI authentication errors', async () => {
      const config = {
        apiKey: 'sk-test-key',
      };

      const openAI = await import('openai');
      // @ts-expect-error - Mock constructor signature differs from real SDK
      SHARED_CREATE.mockRejectedValue(new openAI.AuthenticationError({ 
        message: 'Invalid API key' 
      }));

      const provider = new OpenAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } } },
      };

      await expect(
        provider.runPromptStructured('Test content', 'Test prompt', schema)
      ).rejects.toThrow('OpenAI authentication failed: Invalid API key');
    });

    it('handles unknown errors', async () => {
      const config = {
        apiKey: 'sk-test-key',
      };

      SHARED_CREATE.mockRejectedValue(new Error('Unknown error'));

      const provider = new OpenAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } } },
      };

      await expect(
        provider.runPromptStructured('Test content', 'Test prompt', schema)
      ).rejects.toThrow('OpenAI API call failed: Unknown error');
    });

    it('handles response validation errors', async () => {
      const config = {
        apiKey: 'sk-test-key',
      };

      // Mock an invalid response that will fail schema validation
      const invalidResponse = {
        // Missing required 'choices' field
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      SHARED_CREATE.mockResolvedValue(invalidResponse);

      const provider = new OpenAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } } },
      };

      await expect(
        provider.runPromptStructured('Test content', 'Test prompt', schema)
      ).rejects.toThrow('API Response Error: Invalid OpenAI API response structure');
    });

    it('throws error when response has no content', async () => {
      const config = {
        apiKey: 'sk-test-key',
      };

      const mockResponse: OpenAIResponse = {
        choices: [
          {
            message: {
              content: null,
            },
            finish_reason: 'stop',
          },
        ],
      };

      SHARED_CREATE.mockResolvedValue(mockResponse);

      const provider = new OpenAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } } },
      };

      await expect(
        provider.runPromptStructured('Test content', 'Test prompt', schema)
      ).rejects.toThrow('Empty response from OpenAI API (no content).');
    });

    it('throws error when response has empty content', async () => {
      const config = {
        apiKey: 'sk-test-key',
      };

      const mockResponse: OpenAIResponse = {
        choices: [
          {
            message: {
              content: '   ',
            },
            finish_reason: 'stop',
          },
        ],
      };

      SHARED_CREATE.mockResolvedValue(mockResponse);

      const provider = new OpenAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } } },
      };

      await expect(
        provider.runPromptStructured('Test content', 'Test prompt', schema)
      ).rejects.toThrow('Empty response from OpenAI API (no content).');
    });

    it('throws error when JSON parsing fails', async () => {
      const config = {
        apiKey: 'sk-test-key',
      };

      const mockResponse: OpenAIResponse = {
        choices: [
          {
            message: {
              content: 'invalid json content',
            },
            finish_reason: 'stop',
          },
        ],
      };

      SHARED_CREATE.mockResolvedValue(mockResponse);

      const provider = new OpenAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } } },
      };

      await expect(
        provider.runPromptStructured('Test content', 'Test prompt', schema)
      ).rejects.toThrow('Failed to parse structured JSON response');
    });

    it('includes response preview in JSON parsing error', async () => {
      const config = {
        apiKey: 'sk-test-key',
      };

      const longInvalidJson = 'invalid json content that is longer than 200 characters '.repeat(10);
      const mockResponse: OpenAIResponse = {
        choices: [
          {
            message: {
              content: longInvalidJson,
            },
            finish_reason: 'stop',
          },
        ],
      };

      SHARED_CREATE.mockResolvedValue(mockResponse);

      const provider = new OpenAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } } },
      };

      await expect(
        provider.runPromptStructured('Test content', 'Test prompt', schema)
      ).rejects.toThrow(/Preview:.*\.\.\./);
    });
  });

  describe('Debugging and Logging', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('logs debug information when debug is enabled', async () => {
      const config = {
        apiKey: 'sk-test-key',
        debug: true,
      };

      const mockResponse: OpenAIResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ result: 'success' }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      SHARED_CREATE.mockResolvedValue(mockResponse);

      const provider = new OpenAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } } },
      };

      await provider.runPromptStructured('Test content', 'Test prompt', schema);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[vectorlint] Sending request to OpenAI:',
        expect.objectContaining({
          model: 'gpt-4o',
          temperature: 0.2,
        })
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        '[vectorlint] LLM response meta:',
        expect.objectContaining({
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
          },
          finish_reason: 'stop',
        })
      );
    });

    it('shows full prompt when showPrompt is enabled', async () => {
      const config = {
        apiKey: 'sk-test-key',
        debug: true,
        showPrompt: true,
      };

      const mockResponse: OpenAIResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ result: 'success' }),
            },
            finish_reason: 'stop',
          },
        ],
      };

      SHARED_CREATE.mockResolvedValue(mockResponse);

      const provider = new OpenAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } } },
      };

      await provider.runPromptStructured('Test content', 'Test prompt', schema);

      expect(consoleSpy).toHaveBeenCalledWith('[vectorlint] System prompt (full):');
      expect(consoleSpy).toHaveBeenCalledWith('[vectorlint] User content (full):');
      expect(consoleSpy).toHaveBeenCalledWith('Test content');
    });

    it('shows truncated prompt when showPromptTrunc is enabled', async () => {
      const config = {
        apiKey: 'sk-test-key',
        debug: true,
        showPromptTrunc: true,
      };

      const mockResponse: OpenAIResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ result: 'success' }),
            },
            finish_reason: 'stop',
          },
        ],
      };

      SHARED_CREATE.mockResolvedValue(mockResponse);

      const provider = new OpenAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } } },
      };

      // Use long content to test truncation
      const longContent = 'A'.repeat(600);
      await provider.runPromptStructured(longContent, 'Test prompt', schema);

      expect(consoleSpy).toHaveBeenCalledWith('[vectorlint] System prompt (first 500 chars):');
      expect(consoleSpy).toHaveBeenCalledWith('[vectorlint] User content preview (first 500 chars):');
      expect(consoleSpy).toHaveBeenCalledWith('A'.repeat(500));
      expect(consoleSpy).toHaveBeenCalledWith('... [truncated]');
    });

    it('shows full JSON response when debugJson is enabled', async () => {
      const config = {
        apiKey: 'sk-test-key',
        debug: true,
        debugJson: true,
      };

      const mockResponse: OpenAIResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ result: 'success' }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      SHARED_CREATE.mockResolvedValue(mockResponse);

      const provider = new OpenAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } } },
      };

      await provider.runPromptStructured('Test content', 'Test prompt', schema);

      expect(consoleSpy).toHaveBeenCalledWith('[vectorlint] Full JSON response:');
      expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(mockResponse, null, 2));
    });

    it('does not log when debug is disabled', async () => {
      const config = {
        apiKey: 'sk-test-key',
        debug: false,
      };

      const mockResponse: OpenAIResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ result: 'success' }),
            },
            finish_reason: 'stop',
          },
        ],
      };

      SHARED_CREATE.mockResolvedValue(mockResponse);

      const provider = new OpenAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } } },
      };

      await provider.runPromptStructured('Test content', 'Test prompt', schema);

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('handles debug JSON stringify errors gracefully', async () => {
      const config = {
        apiKey: 'sk-test-key',
        debug: true,
        debugJson: true,
      };

      // Create a response with circular reference to cause JSON.stringify to fail
      const mockResponse: unknown = {
        choices: [
          {
            message: {
              content: JSON.stringify({ result: 'success' }),
            },
            finish_reason: 'stop',
          },
        ],
      };
      (mockResponse as Record<string, unknown>).circular = mockResponse; // Create circular reference

      SHARED_CREATE.mockResolvedValue(mockResponse);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const provider = new OpenAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } } },
      };

      await provider.runPromptStructured('Test content', 'Test prompt', schema);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[vectorlint] Warning:')
      );

      warnSpy.mockRestore();
    });
  });

  describe('Request Building', () => {
    it('uses request builder to build system prompt', async () => {
      const config = {
        apiKey: 'sk-test-key',
      };

      const mockResponse: OpenAIResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ result: 'success' }),
            },
            finish_reason: 'stop',
          },
        ],
      };

      SHARED_CREATE.mockResolvedValue(mockResponse);

      const mockBuilder = {
        buildPromptBodyForStructured: vi.fn().mockReturnValue('Built system prompt'),
      };

      // @ts-expect-error - Mock builder for testing
      const provider = new OpenAIProvider(config, mockBuilder);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } } },
      };

      await provider.runPromptStructured('Test content', 'Test prompt', schema);

      expect(mockBuilder.buildPromptBodyForStructured).toHaveBeenCalledWith('Test prompt');
      
      expect(SHARED_CREATE).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'Built system prompt' },
            { role: 'user', content: 'Input:\n\nTest content' },
          ],
        })
      );
    });

    it('formats user message correctly', async () => {
      const config = {
        apiKey: 'sk-test-key',
      };

      const mockResponse: OpenAIResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ result: 'success' }),
            },
            finish_reason: 'stop',
          },
        ],
      };

      SHARED_CREATE.mockResolvedValue(mockResponse);

      const provider = new OpenAIProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } } },
      };

      await provider.runPromptStructured('User input content', 'Test prompt', schema);

      expect(SHARED_CREATE).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            { role: 'user', content: 'Input:\n\nUser input content' },
          ]) as unknown[],
        })
      );
    });
  });
});