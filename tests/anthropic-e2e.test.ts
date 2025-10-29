import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProvider } from '../src/providers/provider-factory';
import { parseEnvironment } from '../src/boundaries/env-parser';
import { AnthropicProvider } from '../src/providers/anthropic-provider';
import type { AnthropicMessage } from '../src/schemas/api-schemas';
import type { 
  MockAPIErrorParams, 
  MockAuthenticationErrorParams, 
  MockRateLimitErrorParams,
  MockBadRequestErrorParams,
  MockAnthropicClient 
} from './schemas/mock-schemas';

// Create a shared mock function that all E2E instances will use
const SHARED_E2E_MOCK_CREATE = vi.fn();

// Mock the Anthropic SDK for E2E tests
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn((): MockAnthropicClient => ({
      messages: {
        create: SHARED_E2E_MOCK_CREATE,
      },
    })),
    APIError: class APIError extends Error {
      status: number;
      constructor(params: MockAPIErrorParams) {
        super(params.message);
        this.status = params.status || 500;
        this.name = 'APIError';
      }
    },
    RateLimitError: class RateLimitError extends Error {
      constructor(params: Partial<MockRateLimitErrorParams> = {}) {
        super(params.message ?? 'Rate limit exceeded');
        this.name = 'RateLimitError';
      }
    },
    AuthenticationError: class AuthenticationError extends Error {
      constructor(params: Partial<MockAuthenticationErrorParams> = {}) {
        super(params.message ?? 'Authentication failed');
        this.name = 'AuthenticationError';
      }
    },
    BadRequestError: class BadRequestError extends Error {
      constructor(params: Partial<MockBadRequestErrorParams> = {}) {
        super(params.message ?? 'Bad request');
        this.name = 'BadRequestError';
      }
    },
  };
});

// Mock the API client validation
vi.mock('../src/boundaries/api-client', () => ({
  validateAnthropicResponse: vi.fn(),
}));

describe('Anthropic End-to-End Integration', () => {
  let mockValidateAnthropicResponse: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Get reference to the mocked validation function
    const apiClient = await import('../src/boundaries/api-client');
    mockValidateAnthropicResponse = vi.mocked(apiClient.validateAnthropicResponse);
    
    // Default mock behavior - return the response as-is
    mockValidateAnthropicResponse.mockImplementation((response: unknown) => response as AnthropicMessage);
  });

  describe('Complete Flow from Environment to Provider', () => {
    it('processes complete Anthropic configuration flow', async () => {
      // Step 1: Environment configuration
      const env = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-test-key-12345',
        ANTHROPIC_MODEL: 'claude-3-sonnet-20240229',
        ANTHROPIC_MAX_TOKENS: '4096',
        ANTHROPIC_TEMPERATURE: '0.3',
      };

      // Step 2: Parse environment
      const envConfig = parseEnvironment(env);
      expect(envConfig.LLM_PROVIDER).toBe('anthropic');

      // Step 3: Create provider via factory
      const provider = createProvider(envConfig, {
        debug: true,
        showPrompt: false,
        debugJson: false,
      });
      expect(provider).toBeInstanceOf(AnthropicProvider);

      // Step 4: Mock successful API response
      const mockResponse: AnthropicMessage = {
        id: 'msg_e2e_test',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_e2e_test',
            name: 'content_evaluation',
            input: {
              score: 92,
              feedback: 'Excellent content quality',
              categories: ['clarity', 'accuracy'],
            },
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: {
          input_tokens: 150,
          output_tokens: 75,
        },
      };

      SHARED_E2E_MOCK_CREATE.mockResolvedValue(mockResponse);

      // Step 5: Execute structured prompt
      const schema = {
        name: 'content_evaluation',
        schema: {
          properties: {
            score: { type: 'number' },
            feedback: { type: 'string' },
            categories: { type: 'array', items: { type: 'string' } },
          },
          required: ['score', 'feedback'],
        },
      };

      const result = await provider.runPromptStructured(
        'Test content for evaluation',
        'Evaluate this content for quality',
        schema
      );

      // Step 6: Verify results
      expect(result).toEqual({
        score: 92,
        feedback: 'Excellent content quality',
        categories: ['clarity', 'accuracy'],
      });

      // Verify API was called with correct parameters
      expect(SHARED_E2E_MOCK_CREATE).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 4096,
          temperature: 0.3,
          tools: [
            {
              name: 'content_evaluation',
              description: 'Submit content_evaluation evaluation results',
              input_schema: {
                type: 'object',
                properties: {
                  score: { type: 'number' },
                  feedback: { type: 'string' },
                  categories: { type: 'array', items: { type: 'string' } },
                },
                required: ['score', 'feedback'],
              },
            },
          ],
          tool_choice: { type: 'tool', name: 'content_evaluation' },
        })
      );
    });

    it('handles minimal Anthropic configuration with defaults', async () => {
      // Step 1: Minimal environment configuration
      const env = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-minimal-key',
      };

      // Step 2: Parse environment (should apply defaults)
      const envConfig = parseEnvironment(env);
      expect(envConfig.LLM_PROVIDER).toBe('anthropic');
      if (envConfig.LLM_PROVIDER === 'anthropic') {
        expect(envConfig.ANTHROPIC_MODEL).toBe('claude-3-sonnet-20240229');
        expect(envConfig.ANTHROPIC_MAX_TOKENS).toBe(4096);
      }

      // Step 3: Create provider
      const provider = createProvider(envConfig);
      expect(provider).toBeInstanceOf(AnthropicProvider);

      // Step 4: Mock response
      const mockResponse: AnthropicMessage = {
        id: 'msg_minimal_test',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_minimal_test',
            name: 'simple_eval',
            input: { result: 'success' },
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: {
          input_tokens: 50,
          output_tokens: 25,
        },
      };

      SHARED_E2E_MOCK_CREATE.mockResolvedValue(mockResponse);

      // Step 5: Execute with defaults
      const schema = {
        name: 'simple_eval',
        schema: {
          properties: { result: { type: 'string' } },
          required: ['result'],
        },
      };

      const result = await provider.runPromptStructured(
        'Simple test',
        'Simple prompt',
        schema
      );

      expect(result).toEqual({ result: 'success' });

      // Verify defaults were used
      expect(SHARED_E2E_MOCK_CREATE).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 4096,
          temperature: 0.2, // Default temperature
        })
      );
    });

    it('processes backward compatible Azure OpenAI configuration', () => {
      // Test that existing Azure OpenAI configs still work
      const env = {
        // No LLM_PROVIDER specified - should default to azure-openai
        AZURE_OPENAI_API_KEY: 'legacy-key',
        AZURE_OPENAI_ENDPOINT: 'https://legacy.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'legacy-deployment',
      };

      const envConfig = parseEnvironment(env);
      expect(envConfig.LLM_PROVIDER).toBe('azure-openai');

      const provider = createProvider(envConfig);
      // Should create Azure OpenAI provider, not Anthropic
      expect(provider).not.toBeInstanceOf(AnthropicProvider);
    });
  });

  describe('Error Scenarios and Recovery', () => {
    it('handles Anthropic API authentication errors end-to-end', async () => {
      const env = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'invalid-key',
      };

      const envConfig = parseEnvironment(env);
      const provider = createProvider(envConfig);

      // Mock authentication error
      const anthropic = await import('@anthropic-ai/sdk');
      // @ts-expect-error - Mock constructor signature differs from real SDK
      SHARED_E2E_MOCK_CREATE.mockRejectedValue(new anthropic.AuthenticationError({ 
        message: 'Invalid API key' 
      }));

      const schema = {
        name: 'test_eval',
        schema: { properties: { result: { type: 'string' } } },
      };

      await expect(
        provider.runPromptStructured('Test', 'Test prompt', schema)
      ).rejects.toThrow();
    });

    it('handles Anthropic API rate limit errors end-to-end', async () => {
      const env = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
      };

      const envConfig = parseEnvironment(env);
      const provider = createProvider(envConfig);

      // Mock rate limit error
      const anthropic = await import('@anthropic-ai/sdk');
      // @ts-expect-error - Mock constructor signature differs from real SDK
      SHARED_E2E_MOCK_CREATE.mockRejectedValue(new anthropic.RateLimitError({ 
        message: 'Rate limit exceeded' 
      }));

      const schema = {
        name: 'test_eval',
        schema: { properties: { result: { type: 'string' } } },
      };

      await expect(
        provider.runPromptStructured('Test', 'Test prompt', schema)
      ).rejects.toThrow();
    });

    it('handles invalid environment configuration', () => {
      const env = {
        LLM_PROVIDER: 'anthropic',
        // Missing required ANTHROPIC_API_KEY
      };

      expect(() => parseEnvironment(env)).toThrow(/Missing required Anthropic environment variables/);
    });

    it('handles malformed API responses', async () => {
      const env = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
      };

      const envConfig = parseEnvironment(env);
      const provider = createProvider(envConfig);

      // Mock malformed response (missing content)
      const malformedResponse = {
        id: 'msg_malformed',
        type: 'message',
        role: 'assistant',
        content: [], // Empty content array
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 0 },
      };

      SHARED_E2E_MOCK_CREATE.mockResolvedValue(malformedResponse);

      const schema = {
        name: 'test_eval',
        schema: { properties: { result: { type: 'string' } } },
      };

      await expect(
        provider.runPromptStructured('Test', 'Test prompt', schema)
      ).rejects.toThrow('Empty response from Anthropic API (no content blocks)');
    });

    it('handles response with wrong tool name', async () => {
      const env = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
      };

      const envConfig = parseEnvironment(env);
      const provider = createProvider(envConfig);

      // Mock response with wrong tool name
      const wrongToolResponse: AnthropicMessage = {
        id: 'msg_wrong_tool',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_wrong',
            name: 'unexpected_tool',
            input: { result: 'wrong' },
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: { input_tokens: 50, output_tokens: 25 },
      };

      SHARED_E2E_MOCK_CREATE.mockResolvedValue(wrongToolResponse);

      const schema = {
        name: 'expected_tool',
        schema: { properties: { result: { type: 'string' } } },
      };

      await expect(
        provider.runPromptStructured('Test', 'Test prompt', schema)
      ).rejects.toThrow('Expected tool call \'expected_tool\' but received: unexpected_tool');
    });
  });

  describe('Structured Response Parsing and Validation', () => {
    it('correctly parses complex structured responses', async () => {
      const env = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
      };

      const envConfig = parseEnvironment(env);
      const provider = createProvider(envConfig);

      // Mock complex structured response
      const complexResponse: AnthropicMessage = {
        id: 'msg_complex',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_complex',
            name: 'detailed_evaluation',
            input: {
              overall_score: 87.5,
              detailed_scores: {
                clarity: 90,
                accuracy: 85,
                completeness: 88,
              },
              recommendations: [
                'Improve technical accuracy',
                'Add more examples',
              ],
              metadata: {
                word_count: 1250,
                reading_level: 'intermediate',
                topics: ['technology', 'education'],
              },
            },
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: { input_tokens: 200, output_tokens: 100 },
      };

      SHARED_E2E_MOCK_CREATE.mockResolvedValue(complexResponse);

      const schema = {
        name: 'detailed_evaluation',
        schema: {
          properties: {
            overall_score: { type: 'number' },
            detailed_scores: {
              type: 'object',
              properties: {
                clarity: { type: 'number' },
                accuracy: { type: 'number' },
                completeness: { type: 'number' },
              },
            },
            recommendations: {
              type: 'array',
              items: { type: 'string' },
            },
            metadata: {
              type: 'object',
              properties: {
                word_count: { type: 'number' },
                reading_level: { type: 'string' },
                topics: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          required: ['overall_score', 'detailed_scores'],
        },
      };

      const result = await provider.runPromptStructured(
        'Complex content to evaluate',
        'Provide detailed evaluation',
        schema
      );

      expect(result).toEqual({
        overall_score: 87.5,
        detailed_scores: {
          clarity: 90,
          accuracy: 85,
          completeness: 88,
        },
        recommendations: [
          'Improve technical accuracy',
          'Add more examples',
        ],
        metadata: {
          word_count: 1250,
          reading_level: 'intermediate',
          topics: ['technology', 'education'],
        },
      });
    });

    it('handles responses with text content alongside tool use', async () => {
      const env = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
      };

      const envConfig = parseEnvironment(env);
      const provider = createProvider(envConfig);

      // Mock response with both text and tool use
      const mixedResponse: AnthropicMessage = {
        id: 'msg_mixed',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'I\'ll evaluate this content for you.',
          },
          {
            type: 'tool_use',
            id: 'tool_mixed',
            name: 'content_score',
            input: {
              score: 78,
              notes: 'Good overall quality',
            },
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: { input_tokens: 80, output_tokens: 40 },
      };

      SHARED_E2E_MOCK_CREATE.mockResolvedValue(mixedResponse);

      const schema = {
        name: 'content_score',
        schema: {
          properties: {
            score: { type: 'number' },
            notes: { type: 'string' },
          },
          required: ['score'],
        },
      };

      const result = await provider.runPromptStructured(
        'Content to score',
        'Score this content',
        schema
      );

      // Should extract the tool use result, ignoring the text
      expect(result).toEqual({
        score: 78,
        notes: 'Good overall quality',
      });
    });
  });

  describe('Configuration Integration', () => {
    it('integrates debug options through the complete flow', async () => {
      const env = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-debug-key',
      };

      const envConfig = parseEnvironment(env);
      const provider = createProvider(envConfig, {
        debug: true,
        showPrompt: true,
        debugJson: true,
      });

      const mockResponse: AnthropicMessage = {
        id: 'msg_debug',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_debug',
            name: 'debug_eval',
            input: { status: 'debug_success' },
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: { input_tokens: 30, output_tokens: 15 },
      };

      SHARED_E2E_MOCK_CREATE.mockResolvedValue(mockResponse);

      const schema = {
        name: 'debug_eval',
        schema: { properties: { status: { type: 'string' } } },
      };

      // Mock console.log to verify debug output
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await provider.runPromptStructured(
        'Debug test content',
        'Debug test prompt',
        schema
      );

      expect(result).toEqual({ status: 'debug_success' });

      // Verify debug logging occurred
      expect(consoleSpy).toHaveBeenCalledWith(
        '[vectorlint] Sending request to Anthropic:',
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });

    it('handles temperature configuration through complete flow', async () => {
      const env = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-temp-key',
        ANTHROPIC_TEMPERATURE: '0.8',
      };

      const envConfig = parseEnvironment(env);
      const provider = createProvider(envConfig);

      const mockResponse: AnthropicMessage = {
        id: 'msg_temp',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_temp',
            name: 'temp_eval',
            input: { creativity: 'high' },
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: { input_tokens: 40, output_tokens: 20 },
      };

      SHARED_E2E_MOCK_CREATE.mockResolvedValue(mockResponse);

      const schema = {
        name: 'temp_eval',
        schema: { properties: { creativity: { type: 'string' } } },
      };

      await provider.runPromptStructured(
        'Creative content',
        'Creative prompt',
        schema
      );

      // Verify temperature was passed through
      expect(SHARED_E2E_MOCK_CREATE).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.8,
        })
      );
    });
  });
});