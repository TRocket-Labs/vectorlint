import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AzureOpenAIProvider } from '../src/providers/azure-openai-provider';
import type { OpenAIResponse } from '../src/schemas/api-schemas';

// Shared mock function
const SHARED_CREATE = vi.fn();

// Hoist error classes
const ERRORS = vi.hoisted(() => {
  class APIError extends Error {
    status: number;
    constructor(params: { message: string; status?: number }) {
      super(params.message);
      this.name = 'APIError';
      this.status = params.status ?? 500;
    }
  }

  class AuthenticationError extends APIError {
    constructor(params: { message?: string; options?: unknown; body?: unknown }) {
      super({
        message: params.message ?? 'Unauthorized',
        status: 401,
      });
      this.name = 'AuthenticationError';
    }
  }

  class RateLimitError extends APIError {
    constructor(params: { message?: string; options?: unknown; body?: unknown }) {
      super({
        message: params.message ?? 'Rate Limited',
        status: 429,
      });
      this.name = 'RateLimitError';
    }
  }

  return { APIError, AuthenticationError, RateLimitError };
});

// Mock Azure OpenAI SDK (uses openai package)
vi.mock('openai', () => {
  const { APIError, AuthenticationError, RateLimitError } = ERRORS;

  // We need to return a constructor that creates a client
  // The actual import is: import { AzureOpenAI } from 'openai';
  const azureOpenAI = vi.fn(() => ({
    chat: { completions: { create: SHARED_CREATE } },
  }));

  // Attach error classes to the constructor
  azureOpenAI.APIError = APIError;
  azureOpenAI.AuthenticationError = AuthenticationError;
  azureOpenAI.RateLimitError = RateLimitError;

  return {
    __esModule: true,
    AzureOpenAI: azureOpenAI,
    default: azureOpenAI,
  };
});

// Mock the API client validation
vi.mock('../src/boundaries/api-client', () => ({
  validateApiResponse: vi.fn(),
}));

describe('AzureOpenAIProvider', () => {
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
        endpoint: 'https://test.openai.azure.com',
        deploymentName: 'gpt-4o',
      };

      const provider = new AzureOpenAIProvider(config);
      expect(provider).toBeInstanceOf(AzureOpenAIProvider);
    });

    it('accepts all configuration options', () => {
      const config = {
        apiKey: 'sk-test-key',
        endpoint: 'https://test.openai.azure.com',
        deploymentName: 'gpt-4o',
        apiVersion: '2024-02-15-preview',
        temperature: 0.5,
        debug: true,
        showPrompt: true,
        showPromptTrunc: false,
      };

      expect(() => new AzureOpenAIProvider(config)).not.toThrow();
    });
  });

  describe('Unstructured Response Handling', () => {
    it('successfully returns raw text response', async () => {
      const config = {
        apiKey: 'sk-test-key',
        endpoint: 'https://test.openai.azure.com',
        deploymentName: 'gpt-4o',
      };

      const mockResponse: OpenAIResponse = {
        choices: [
          {
            message: {
              content: 'This is a free-form text response',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 20,
          total_tokens: 70,
        },
      };

      SHARED_CREATE.mockResolvedValue(mockResponse);

      const provider = new AzureOpenAIProvider(config);
      const result = await provider.runPromptUnstructured('Test content', 'Test prompt');

      expect(result.data).toBe('This is a free-form text response');
      expect(result.usage).toBeDefined();
      if (result.usage) {
        expect(result.usage.inputTokens).toBe(50);
        expect(result.usage.outputTokens).toBe(20);
      }
    });

    it('handles empty content gracefully', async () => {
      const config = {
        apiKey: 'sk-test-key',
        endpoint: 'https://test.openai.azure.com',
        deploymentName: 'gpt-4o',
      };

      const mockResponse: OpenAIResponse = {
        choices: [
          {
            message: {
              content: '',
            },
            finish_reason: 'stop',
          },
        ],
      };

      SHARED_CREATE.mockResolvedValue(mockResponse);

      const provider = new AzureOpenAIProvider(config);

      await expect(
        provider.runPromptUnstructured('Test content', 'Test prompt')
      ).rejects.toThrow('Empty response from LLM');
    });

    it('handles null content gracefully', async () => {
      const config = {
        apiKey: 'sk-test-key',
        endpoint: 'https://test.openai.azure.com',
        deploymentName: 'gpt-4o',
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

      const provider = new AzureOpenAIProvider(config);

      await expect(
        provider.runPromptUnstructured('Test content', 'Test prompt')
      ).rejects.toThrow('Empty response from LLM');
    });

    it('does not attempt JSON parsing for unstructured response', async () => {
      const config = {
        apiKey: 'sk-test-key',
        endpoint: 'https://test.openai.azure.com',
        deploymentName: 'gpt-4o',
      };

      const mockResponse: OpenAIResponse = {
        choices: [
          {
            message: {
              content: 'This looks like JSON but is treated as text: {"key": "value"}',
            },
            finish_reason: 'stop',
          },
        ],
      };

      SHARED_CREATE.mockResolvedValue(mockResponse);

      const provider = new AzureOpenAIProvider(config);
      const result = await provider.runPromptUnstructured('Test content', 'Test prompt');

      expect(result.data).toBe('This looks like JSON but is treated as text: {"key": "value"}');
    });

    it('returns markdown formatted text as-is', async () => {
      const config = {
        apiKey: 'sk-test-key',
        endpoint: 'https://test.openai.azure.com',
        deploymentName: 'gpt-4o',
      };

      const markdownResponse = `# Issue 1

**Quoted text:** "foo bar"

**Line:** 42

**Analysis:** This is a problem`;

      const mockResponse: OpenAIResponse = {
        choices: [
          {
            message: {
              content: markdownResponse,
            },
            finish_reason: 'stop',
          },
        ],
      };

      SHARED_CREATE.mockResolvedValue(mockResponse);

      const provider = new AzureOpenAIProvider(config);
      const result = await provider.runPromptUnstructured('Test content', 'Test prompt');

      expect(result.data).toBe(markdownResponse);
    });

    it('uses custom temperature for unstructured calls', async () => {
      const config = {
        apiKey: 'sk-test-key',
        endpoint: 'https://test.openai.azure.com',
        deploymentName: 'gpt-4o',
        temperature: 0.8,
      };

      const mockResponse: OpenAIResponse = {
        choices: [
          {
            message: {
              content: 'Response text',
            },
            finish_reason: 'stop',
          },
        ],
      };

      SHARED_CREATE.mockResolvedValue(mockResponse);

      const provider = new AzureOpenAIProvider(config);
      await provider.runPromptUnstructured('Test content', 'Test prompt');

      expect(SHARED_CREATE).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.8,
        })
      );
    });

    it('throws error when response has no content', async () => {
      const config = {
        apiKey: 'sk-test-key',
        endpoint: 'https://test.openai.azure.com',
        deploymentName: 'gpt-4o',
      };

      const mockResponse: OpenAIResponse = {
        choices: [
          {
            message: {
              content: '',
            },
            finish_reason: 'stop',
          },
        ],
      };

      SHARED_CREATE.mockResolvedValue(mockResponse);

      const provider = new AzureOpenAIProvider(config);

      await expect(
        provider.runPromptUnstructured('Test content', 'Test prompt')
      ).rejects.toThrow('Empty response from LLM (no content).');
    });

    it('handles unknown errors', async () => {
      const config = {
        apiKey: 'sk-test-key',
        endpoint: 'https://test.openai.azure.com',
        deploymentName: 'gpt-4o',
      };

      SHARED_CREATE.mockRejectedValue(new Error('Unknown error'));

      const provider = new AzureOpenAIProvider(config);

      await expect(
        provider.runPromptUnstructured('Test content', 'Test prompt')
      ).rejects.toThrow('OpenAI API call failed: Unknown error');
    });

    it('handles response validation errors', async () => {
      const config = {
        apiKey: 'sk-test-key',
        endpoint: 'https://test.openai.azure.com',
        deploymentName: 'gpt-4o',
      };

      const invalidResponse = {
        // Missing required 'choices' field
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      SHARED_CREATE.mockResolvedValue(invalidResponse);

      const provider = new AzureOpenAIProvider(config);

      await expect(
        provider.runPromptUnstructured('Test content', 'Test prompt')
      ).rejects.toThrow('Received streaming response when expecting unstructured response');
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

    it('logs debug information for unstructured calls', async () => {
      const config = {
        apiKey: 'sk-test-key',
        endpoint: 'https://test.openai.azure.com',
        deploymentName: 'gpt-4o',
        debug: true,
      };

      const mockResponse: OpenAIResponse = {
        choices: [
          {
            message: {
              content: 'Response text',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 20,
          total_tokens: 70,
        },
      };

      SHARED_CREATE.mockResolvedValue(mockResponse);

      const provider = new AzureOpenAIProvider(config);
      await provider.runPromptUnstructured('Test content', 'Test prompt');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[vectorlint] Sending unstructured request to Azure OpenAI:',
        expect.objectContaining({
          model: 'gpt-4o',
          temperature: undefined,
        })
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        '[vectorlint] LLM response meta:',
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          usage: expect.anything(),
          finish_reason: 'stop',
        })
      );
    });
  });

  describe('Structured Response Handling', () => {
    it('successfully parses structured JSON response', async () => {
      const config = {
        apiKey: 'sk-test-key',
        endpoint: 'https://test.openai.azure.com',
        deploymentName: 'gpt-4o',
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

      const provider = new AzureOpenAIProvider(config);
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
  });
});
