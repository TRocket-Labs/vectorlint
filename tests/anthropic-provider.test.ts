import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicProvider } from '../src/providers/anthropic-provider';
import { DefaultRequestBuilder } from '../src/providers/request-builder';
import type { AnthropicMessage } from '../src/schemas/api-schemas';
import type { 
  MockAPIErrorParams, 
  MockAuthenticationErrorParams, 
  MockRateLimitErrorParams,
  MockBadRequestErrorParams,
  MockAnthropicClient 
} from './schemas/mock-schemas';

// Create a shared mock function that all instances will use
const SHARED_MOCK_CREATE = vi.fn();

// Mock the Anthropic SDK module
vi.mock('@anthropic-ai/sdk', () => {
  // Create error classes inside the mock factory
  class APIError extends Error {
    status: number;
    constructor(params: MockAPIErrorParams) {
      super(params.message);
      this.status = params.status || 500;
      this.name = 'APIError';
    }
  }

  class RateLimitError extends Error {
    constructor(params: Partial<MockRateLimitErrorParams> = {}) {
      super(params.message ?? 'Rate limit exceeded');
      this.name = 'RateLimitError';
    }
  }

  class AuthenticationError extends Error {
    constructor(params: Partial<MockAuthenticationErrorParams> = {}) {
      super(params.message ?? 'Authentication failed');
      this.name = 'AuthenticationError';
    }
  }

  class BadRequestError extends Error {
    constructor(params: Partial<MockBadRequestErrorParams> = {}) {
      super(params.message ?? 'Bad request');
      this.name = 'BadRequestError';
    }
  }

  return {
    default: vi.fn((): MockAnthropicClient => ({
      messages: {
        create: SHARED_MOCK_CREATE,
      },
    })),
    APIError,
    RateLimitError,
    AuthenticationError,
    BadRequestError,
  };
});

// Mock the API client validation
vi.mock('../src/boundaries/api-client', () => ({
  validateAnthropicResponse: vi.fn(),
}));

describe('AnthropicProvider', () => {
  let mockValidateAnthropicResponse: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Get reference to the mocked validation function
    const apiClient = await import('../src/boundaries/api-client');
    mockValidateAnthropicResponse = vi.mocked(apiClient.validateAnthropicResponse);
    
    // Default mock behavior - return the response as-is
    mockValidateAnthropicResponse.mockImplementation((response: unknown) => response as AnthropicMessage);
  });

  describe('Constructor', () => {
    it('creates provider with required config', () => {
      const config = {
        apiKey: 'sk-ant-test-key',
      };

      const provider = new AnthropicProvider(config);
      expect(provider).toBeInstanceOf(AnthropicProvider);
    });

    it('applies default values for optional config', () => {
      const config = {
        apiKey: 'sk-ant-test-key',
      };

      // Should not throw - defaults should be applied internally
      expect(() => new AnthropicProvider(config)).not.toThrow();
    });

    it('accepts custom request builder', () => {
      const config = {
        apiKey: 'sk-ant-test-key',
      };
      const customBuilder = new DefaultRequestBuilder('custom directive');

      expect(() => new AnthropicProvider(config, customBuilder)).not.toThrow();
    });

    it('accepts all configuration options', () => {
      const config = {
        apiKey: 'sk-ant-test-key',
        model: 'claude-3-haiku-20240307',
        maxTokens: 2048,
        temperature: 0.5,
        debug: true,
        showPrompt: true,
        showPromptTrunc: false,
        debugJson: true,
      };

      expect(() => new AnthropicProvider(config)).not.toThrow();
    });
  });

  describe('Structured Response Handling', () => {
    it('successfully extracts structured response from tool use', async () => {
      const config = {
        apiKey: 'sk-ant-test-key',
      };

      const mockResponse: AnthropicMessage = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'submit_evaluation',
            input: {
              score: 85,
              feedback: 'Good content',
            },
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      SHARED_MOCK_CREATE.mockResolvedValue(mockResponse);

      const provider = new AnthropicProvider(config);
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

    it('converts schema to Anthropic tool format correctly', async () => {
      const config = {
        apiKey: 'sk-ant-test-key',
      };

      const mockResponse: AnthropicMessage = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'test_tool',
            input: { result: 'success' },
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      SHARED_MOCK_CREATE.mockResolvedValue(mockResponse);

      const provider = new AnthropicProvider(config);
      const schema = {
        name: 'test_tool',
        schema: {
          properties: {
            result: { type: 'string' },
          },
          required: ['result'],
        },
      };

      await provider.runPromptStructured('Test content', 'Test prompt', schema);

      expect(SHARED_MOCK_CREATE).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [
            {
              name: 'test_tool',
              description: 'Submit test_tool evaluation results',
              input_schema: {
                type: 'object',
                properties: {
                  result: { type: 'string' },
                },
                required: ['result'],
              },
            },
          ],
          tool_choice: { type: 'tool', name: 'test_tool' },
        })
      );
    });

    it('includes temperature in API call when configured', async () => {
      const config = {
        apiKey: 'sk-ant-test-key',
        temperature: 0.7,
      };

      const mockResponse: AnthropicMessage = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'test_tool',
            input: { result: 'success' },
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      SHARED_MOCK_CREATE.mockResolvedValue(mockResponse);

      const provider = new AnthropicProvider(config);
      const schema = {
        name: 'test_tool',
        schema: { properties: { result: { type: 'string' } } },
      };

      await provider.runPromptStructured('Test content', 'Test prompt', schema);

      expect(SHARED_MOCK_CREATE).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
        })
      );
    });

    it('uses default temperature when not explicitly configured', async () => {
      const config = {
        apiKey: 'sk-ant-test-key',
      };

      const mockResponse: AnthropicMessage = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'test_tool',
            input: { result: 'success' },
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      SHARED_MOCK_CREATE.mockResolvedValue(mockResponse);

      const provider = new AnthropicProvider(config);
      const schema = {
        name: 'test_tool',
        schema: { properties: { result: { type: 'string' } } },
      };

      await provider.runPromptStructured('Test content', 'Test prompt', schema);

      const callArgs = SHARED_MOCK_CREATE.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(callArgs?.temperature).toBe(0.2); // Default temperature
    });
  });

  describe('Error Handling', () => {
    it('handles Anthropic API errors with status codes', async () => {
      const config = {
        apiKey: 'sk-ant-test-key',
      };

      const anthropic = await import('@anthropic-ai/sdk');
      SHARED_MOCK_CREATE.mockRejectedValue(new anthropic.APIError({ 
        message: 'Invalid request', 
        status: 400 
      }));

      const provider = new AnthropicProvider(config);
      const schema = {
        name: 'test_tool',
        schema: { properties: { result: { type: 'string' } } },
      };

      await expect(
        provider.runPromptStructured('Test content', 'Test prompt', schema)
      ).rejects.toThrow();
    });

    it('handles Anthropic rate limit errors', async () => {
      const config = {
        apiKey: 'sk-ant-test-key',
      };

      const anthropic = await import('@anthropic-ai/sdk');
      SHARED_MOCK_CREATE.mockRejectedValue(new anthropic.RateLimitError({ 
        message: 'Rate limit exceeded' 
      }));

      const provider = new AnthropicProvider(config);
      const schema = {
        name: 'test_tool',
        schema: { properties: { result: { type: 'string' } } },
      };

      await expect(
        provider.runPromptStructured('Test content', 'Test prompt', schema)
      ).rejects.toThrow();
    });

    it('handles Anthropic authentication errors', async () => {
      const config = {
        apiKey: 'sk-ant-test-key',
      };

      const anthropic = await import('@anthropic-ai/sdk');
      SHARED_MOCK_CREATE.mockRejectedValue(new anthropic.AuthenticationError({ 
        message: 'Invalid API key' 
      }));

      const provider = new AnthropicProvider(config);
      const schema = {
        name: 'test_tool',
        schema: { properties: { result: { type: 'string' } } },
      };

      await expect(
        provider.runPromptStructured('Test content', 'Test prompt', schema)
      ).rejects.toThrow();
    });

    it('handles Anthropic bad request errors', async () => {
      const config = {
        apiKey: 'sk-ant-test-key',
      };

      const anthropic = await import('@anthropic-ai/sdk');
      SHARED_MOCK_CREATE.mockRejectedValue(new anthropic.BadRequestError({ 
        message: 'Bad request' 
      }));

      const provider = new AnthropicProvider(config);
      const schema = {
        name: 'test_tool',
        schema: { properties: { result: { type: 'string' } } },
      };

      await expect(
        provider.runPromptStructured('Test content', 'Test prompt', schema)
      ).rejects.toThrow();
    });

    it('handles unknown errors', async () => {
      const config = {
        apiKey: 'sk-ant-test-key',
      };

      SHARED_MOCK_CREATE.mockRejectedValue(new Error('Unknown error'));

      const provider = new AnthropicProvider(config);
      const schema = {
        name: 'test_tool',
        schema: { properties: { result: { type: 'string' } } },
      };

      await expect(
        provider.runPromptStructured('Test content', 'Test prompt', schema)
      ).rejects.toThrow();
    });

    it('handles response validation errors', async () => {
      const config = {
        apiKey: 'sk-ant-test-key',
      };

      // Mock an invalid response that will fail schema validation
      const invalidResponse = {
        // Missing required fields like 'id', 'type', 'role', 'content', etc.
        model: 'claude-3-sonnet-20240229',
      };

      SHARED_MOCK_CREATE.mockResolvedValue(invalidResponse);

      const provider = new AnthropicProvider(config);
      const schema = {
        name: 'test_tool',
        schema: { properties: { result: { type: 'string' } } },
      };

      await expect(
        provider.runPromptStructured('Test content', 'Test prompt', schema)
      ).rejects.toThrow('API Response Error: Invalid Anthropic API response structure');
    });

    it('throws error when response has no content', async () => {
      const config = {
        apiKey: 'sk-ant-test-key',
      };

      const mockResponse: AnthropicMessage = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 100,
          output_tokens: 0,
        },
      };

      SHARED_MOCK_CREATE.mockResolvedValue(mockResponse);

      const provider = new AnthropicProvider(config);
      const schema = {
        name: 'test_tool',
        schema: { properties: { result: { type: 'string' } } },
      };

      await expect(
        provider.runPromptStructured('Test content', 'Test prompt', schema)
      ).rejects.toThrow('Empty response from Anthropic API (no content blocks).');
    });

    it('throws error when no tool use is found', async () => {
      const config = {
        apiKey: 'sk-ant-test-key',
      };

      const mockResponse: AnthropicMessage = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'I cannot provide structured output',
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 100,
          output_tokens: 20,
        },
      };

      SHARED_MOCK_CREATE.mockResolvedValue(mockResponse);

      const provider = new AnthropicProvider(config);
      const schema = {
        name: 'test_tool',
        schema: { properties: { result: { type: 'string' } } },
      };

      await expect(
        provider.runPromptStructured('Test content', 'Test prompt', schema)
      ).rejects.toThrow('No tool call received for test_tool. Response contains text instead: I cannot provide structured output');
    });

    it('throws error when wrong tool name is used', async () => {
      const config = {
        apiKey: 'sk-ant-test-key',
      };

      const mockResponse: AnthropicMessage = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'wrong_tool',
            input: { result: 'success' },
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      SHARED_MOCK_CREATE.mockResolvedValue(mockResponse);

      const provider = new AnthropicProvider(config);
      const schema = {
        name: 'expected_tool',
        schema: { properties: { result: { type: 'string' } } },
      };

      await expect(
        provider.runPromptStructured('Test content', 'Test prompt', schema)
      ).rejects.toThrow('Expected tool call \'expected_tool\' but received: wrong_tool');
    });

    it('throws error when tool input is empty', async () => {
      const config = {
        apiKey: 'sk-ant-test-key',
      };

      const mockResponse: AnthropicMessage = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'test_tool',
            input: {},
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      SHARED_MOCK_CREATE.mockResolvedValue(mockResponse);

      const provider = new AnthropicProvider(config);
      const schema = {
        name: 'test_tool',
        schema: { properties: { result: { type: 'string' } } },
      };

      await expect(
        provider.runPromptStructured('Test content', 'Test prompt', schema)
      ).rejects.toThrow('Tool call for test_tool returned empty or null input.');
    });

    it('throws error when tool input is not an object', async () => {
      const config = {
        apiKey: 'sk-ant-test-key',
      };

      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'test_tool',
            input: 'not an object',
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      SHARED_MOCK_CREATE.mockResolvedValue(mockResponse);

      const provider = new AnthropicProvider(config);
      const schema = {
        name: 'test_tool',
        schema: { properties: { result: { type: 'string' } } },
      };

      await expect(
        provider.runPromptStructured('Test content', 'Test prompt', schema)
      ).rejects.toThrow('Tool call for test_tool returned invalid input type: string');
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
        apiKey: 'sk-ant-test-key',
        debug: true,
      };

      const mockResponse: AnthropicMessage = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'test_tool',
            input: { result: 'success' },
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      SHARED_MOCK_CREATE.mockResolvedValue(mockResponse);

      const provider = new AnthropicProvider(config);
      const schema = {
        name: 'test_tool',
        schema: { properties: { result: { type: 'string' } } },
      };

      await provider.runPromptStructured('Test content', 'Test prompt', schema);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[vectorlint] Sending request to Anthropic:',
        expect.objectContaining({
          model: 'claude-3-sonnet-20240229',
          maxTokens: 4096,
          temperature: 0.2,
        })
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        '[vectorlint] LLM response meta:',
        expect.objectContaining({
          usage: {
            input_tokens: 100,
            output_tokens: 50,
          },
          stop_reason: 'tool_use',
        })
      );
    });

    it('shows full prompt when showPrompt is enabled', async () => {
      const config = {
        apiKey: 'sk-ant-test-key',
        debug: true,
        showPrompt: true,
      };

      const mockResponse: AnthropicMessage = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'test_tool',
            input: { result: 'success' },
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      SHARED_MOCK_CREATE.mockResolvedValue(mockResponse);

      const provider = new AnthropicProvider(config);
      const schema = {
        name: 'test_tool',
        schema: { properties: { result: { type: 'string' } } },
      };

      await provider.runPromptStructured('Test content', 'Test prompt', schema);

      expect(consoleSpy).toHaveBeenCalledWith('[vectorlint] System prompt (full):');
      expect(consoleSpy).toHaveBeenCalledWith('[vectorlint] User content (full):');
      expect(consoleSpy).toHaveBeenCalledWith('Test content');
    });

    it('shows truncated prompt when showPromptTrunc is enabled', async () => {
      const config = {
        apiKey: 'sk-ant-test-key',
        debug: true,
        showPromptTrunc: true,
      };

      const mockResponse: AnthropicMessage = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'test_tool',
            input: { result: 'success' },
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      SHARED_MOCK_CREATE.mockResolvedValue(mockResponse);

      const provider = new AnthropicProvider(config);
      const schema = {
        name: 'test_tool',
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
        apiKey: 'sk-ant-test-key',
        debug: true,
        debugJson: true,
      };

      const mockResponse: AnthropicMessage = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'test_tool',
            input: { result: 'success' },
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      SHARED_MOCK_CREATE.mockResolvedValue(mockResponse);

      const provider = new AnthropicProvider(config);
      const schema = {
        name: 'test_tool',
        schema: { properties: { result: { type: 'string' } } },
      };

      await provider.runPromptStructured('Test content', 'Test prompt', schema);

      expect(consoleSpy).toHaveBeenCalledWith('[vectorlint] Full JSON response:');
      expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(mockResponse, null, 2));
    });

    it('does not log when debug is disabled', async () => {
      const config = {
        apiKey: 'sk-ant-test-key',
        debug: false,
      };

      const mockResponse: AnthropicMessage = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'test_tool',
            input: { result: 'success' },
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      SHARED_MOCK_CREATE.mockResolvedValue(mockResponse);

      const provider = new AnthropicProvider(config);
      const schema = {
        name: 'test_tool',
        schema: { properties: { result: { type: 'string' } } },
      };

      await provider.runPromptStructured('Test content', 'Test prompt', schema);

      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });
});