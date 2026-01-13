import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiProvider } from '../src/providers/gemini-provider';
import { DefaultRequestBuilder } from '../src/providers/request-builder';

// Shared mock function
const SHARED_GENERATE_CONTENT = vi.fn();

// Mock Google Generative AI SDK
vi.mock('@google/generative-ai', () => {
  class GenerativeModel {
    generateContent = SHARED_GENERATE_CONTENT;
  }

  return {
    __esModule: true,
    GoogleGenerativeAI: vi.fn(() => ({
      getGenerativeModel: vi.fn(() => new GenerativeModel()),
    })),
    GenerativeModel,
  };
});

describe('GeminiProvider', () => {
  describe('Constructor', () => {
    it('creates provider with required config', () => {
      const config = {
        apiKey: 'test-gemini-key',
      };

      const provider = new GeminiProvider(config);
      expect(provider).toBeInstanceOf(GeminiProvider);
    });

    it('accepts all configuration options', () => {
      const config = {
        apiKey: 'test-gemini-key',
        model: 'gemini-2.5-flash',
        temperature: 0.5,
        debug: true,
        showPrompt: true,
        showPromptTrunc: false,
      };

      expect(() => new GeminiProvider(config)).not.toThrow();
    });
  });

  describe('Unstructured Response Handling', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('successfully returns raw text response', async () => {
      const config = {
        apiKey: 'test-gemini-key',
      };

      const mockText = 'This is a free-form text response';
      const mockResponse = {
        response: {
          text: vi.fn(() => mockText),
          usageMetadata: {
            promptTokenCount: 50,
            candidatesTokenCount: 20,
          },
        },
      };

      SHARED_GENERATE_CONTENT.mockResolvedValue(mockResponse);

      const provider = new GeminiProvider(config);
      const result = await provider.runPromptUnstructured('Test content', 'Test prompt');

      expect(result.data).toBe(mockText);
      expect(result.usage).toBeDefined();
      if (result.usage) {
        expect(result.usage.inputTokens).toBe(50);
        expect(result.usage.outputTokens).toBe(20);
      }
    });

    it('trims whitespace from response', async () => {
      const config = {
        apiKey: 'test-gemini-key',
      };

      const mockText = '  Response with leading and trailing whitespace  ';
      const mockResponse = {
        response: {
          text: vi.fn(() => mockText),
          usageMetadata: {
            promptTokenCount: 50,
            candidatesTokenCount: 20,
          },
        },
      };

      SHARED_GENERATE_CONTENT.mockResolvedValue(mockResponse);

      const provider = new GeminiProvider(config);
      const result = await provider.runPromptUnstructured('Test content', 'Test prompt');

      expect(result.data).toBe('Response with leading and trailing whitespace');
    });

    it('returns markdown formatted text as-is', async () => {
      const config = {
        apiKey: 'test-gemini-key',
      };

      const markdownResponse = `# Issue 1

**Quoted text:** "foo bar"

**Line:** 42

**Analysis:** This is a problem`;

      const mockResponse = {
        response: {
          text: vi.fn(() => markdownResponse),
          usageMetadata: {
            promptTokenCount: 50,
            candidatesTokenCount: 40,
          },
        },
      };

      SHARED_GENERATE_CONTENT.mockResolvedValue(mockResponse);

      const provider = new GeminiProvider(config);
      const result = await provider.runPromptUnstructured('Test content', 'Test prompt');

      expect(result.data).toBe(markdownResponse);
    });

    it('does not attempt JSON parsing for unstructured response', async () => {
      const config = {
        apiKey: 'test-gemini-key',
      };

      const mockText = 'This looks like JSON but is treated as text: {"key": "value"}';
      const mockResponse = {
        response: {
          text: vi.fn(() => mockText),
          usageMetadata: {
            promptTokenCount: 50,
            candidatesTokenCount: 20,
          },
        },
      };

      SHARED_GENERATE_CONTENT.mockResolvedValue(mockResponse);

      const provider = new GeminiProvider(config);
      const result = await provider.runPromptUnstructured('Test content', 'Test prompt');

      expect(result.data).toBe(mockText);
    });

    it('handles response with no usage metadata', async () => {
      const config = {
        apiKey: 'test-gemini-key',
      };

      const mockText = 'Response text';
      const mockResponse = {
        response: {
          text: vi.fn(() => mockText),
          usageMetadata: null,
        },
      };

      SHARED_GENERATE_CONTENT.mockResolvedValue(mockResponse);

      const provider = new GeminiProvider(config);
      const result = await provider.runPromptUnstructured('Test content', 'Test prompt');

      expect(result.data).toBe(mockText);
      expect(result.usage).toBeUndefined();
    });

    it('handles response with undefined usage metadata', async () => {
      const config = {
        apiKey: 'test-gemini-key',
      };

      const mockText = 'Response text';
      const mockResponse = {
        response: {
          text: vi.fn(() => mockText),
        },
      };

      SHARED_GENERATE_CONTENT.mockResolvedValue(mockResponse);

      const provider = new GeminiProvider(config);
      const result = await provider.runPromptUnstructured('Test content', 'Test prompt');

      expect(result.data).toBe(mockText);
      expect(result.usage).toBeUndefined();
    });

    it('handles unknown errors', async () => {
      const config = {
        apiKey: 'test-gemini-key',
      };

      SHARED_GENERATE_CONTENT.mockRejectedValue(new Error('Unknown error'));

      const provider = new GeminiProvider(config);

      await expect(
        provider.runPromptUnstructured('Test content', 'Test prompt')
      ).rejects.toThrow('Gemini API call failed: Unknown error');
    });
  });

  describe('Debugging and Logging', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
      vi.clearAllMocks();
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('logs debug information for unstructured calls', async () => {
      const config = {
        apiKey: 'test-gemini-key',
        debug: true,
      };

      const mockResponse = {
        response: {
          text: vi.fn(() => 'Response text'),
          usageMetadata: {
            promptTokenCount: 50,
            candidatesTokenCount: 20,
          },
        },
      };

      SHARED_GENERATE_CONTENT.mockResolvedValue(mockResponse);

      const provider = new GeminiProvider(config);
      await provider.runPromptUnstructured('Test content', 'Test prompt');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[vectorlint] Sending unstructured request to Gemini:',
        expect.objectContaining({
          model: 'gemini-2.5-flash',
          temperature: 0.2,
        })
      );
    });

    it('shows full prompt when showPrompt is enabled', async () => {
      const config = {
        apiKey: 'test-gemini-key',
        debug: true,
        showPrompt: true,
      };

      const mockResponse = {
        response: {
          text: vi.fn(() => 'Response text'),
        },
      };

      SHARED_GENERATE_CONTENT.mockResolvedValue(mockResponse);

      const provider = new GeminiProvider(config);
      await provider.runPromptUnstructured('Test content', 'Test prompt');

      expect(consoleErrorSpy).toHaveBeenCalledWith('[vectorlint] Full prompt:');
    });

    it('shows truncated prompt when showPromptTrunc is enabled', async () => {
      const config = {
        apiKey: 'test-gemini-key',
        debug: true,
        showPromptTrunc: true,
      };

      const mockResponse = {
        response: {
          text: vi.fn(() => 'Response text'),
        },
      };

      SHARED_GENERATE_CONTENT.mockResolvedValue(mockResponse);

      const provider = new GeminiProvider(config);
      await provider.runPromptUnstructured('Test content', 'Test prompt');

      expect(consoleErrorSpy).toHaveBeenCalledWith('[vectorlint] Prompt preview (first 500 chars):');
    });

    it('does not log when debug is disabled', async () => {
      const config = {
        apiKey: 'test-gemini-key',
        debug: false,
      };

      const mockResponse = {
        response: {
          text: vi.fn(() => 'Response text'),
        },
      };

      SHARED_GENERATE_CONTENT.mockResolvedValue(mockResponse);

      const provider = new GeminiProvider(config);
      await provider.runPromptUnstructured('Test content', 'Test prompt');

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('Structured Response Handling', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('successfully parses structured JSON response', async () => {
      const config = {
        apiKey: 'test-gemini-key',
      };

      const mockJson = {
        score: 85,
        feedback: 'Good content',
      };
      const mockResponse = {
        response: {
          text: vi.fn(() => JSON.stringify(mockJson)),
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 50,
          },
        },
      };

      SHARED_GENERATE_CONTENT.mockResolvedValue(mockResponse);

      const provider = new GeminiProvider(config);
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

      expect(result.data).toEqual(mockJson);
      expect(result.usage).toBeDefined();
      if (result.usage) {
        expect(result.usage.inputTokens).toBe(100);
        expect(result.usage.outputTokens).toBe(50);
      }
    });

    it('handles JSON parsing errors', async () => {
      const config = {
        apiKey: 'test-gemini-key',
      };

      const mockResponse = {
        response: {
          text: vi.fn(() => 'invalid json content'),
        },
      };

      SHARED_GENERATE_CONTENT.mockResolvedValue(mockResponse);

      const provider = new GeminiProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } } },
      };

      await expect(
        provider.runPromptStructured('Test content', 'Test prompt', schema)
      ).rejects.toThrow('Gemini API call failed');
    });

    it('handles unknown errors in structured calls', async () => {
      const config = {
        apiKey: 'test-gemini-key',
      };

      SHARED_GENERATE_CONTENT.mockRejectedValue(new Error('Unknown error'));

      const provider = new GeminiProvider(config);
      const schema = {
        name: 'test_schema',
        schema: { properties: { result: { type: 'string' } } },
      };

      await expect(
        provider.runPromptStructured('Test content', 'Test prompt', schema)
      ).rejects.toThrow('Gemini API call failed: Unknown error');
    });
  });
});
