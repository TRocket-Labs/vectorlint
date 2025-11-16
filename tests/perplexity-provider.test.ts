import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PerplexitySearchProvider } from '../src/providers/perplexity-provider';
import { createMockPerplexityClient } from './schemas/mock-schemas';

const SHARED_CREATE = vi.fn();

// Mock the Perplexity SDK before importing SUT to avoid TDZ issues
vi.mock('@perplexity-ai/perplexity_ai', () => {
  return {
    __esModule: true,
    default: vi.fn(() => ({
      search: {
        create: SHARED_CREATE,
      },
    })),
  };
});

const MOCK_RESULTS = [
  {
    title: 'AI Overview',
    snippet: 'AI tools in 2025 are evolving fast.',
    url: 'https://example.com/ai-overview',
    date: '',
  },
  {
    title: 'Developer Productivity',
    snippet: 'AI improves developer efficiency by 40%.',
    url: 'https://example.com/dev-productivity',
    date: '',
  },
];

describe('PerplexitySearchProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('initializes with defaults', () => {
      const provider = new PerplexitySearchProvider();
      expect(provider).toBeInstanceOf(PerplexitySearchProvider);
    });

    it('accepts override config', () => {
      const provider = new PerplexitySearchProvider({ maxResults: 10, maxTokensPerPage: 512, debug: true });
      expect(provider).toBeInstanceOf(PerplexitySearchProvider);
    });
  });

  describe('Search behavior', () => {
    it('calls the Perplexity API with valid parameters and normalizes results', async () => {
      SHARED_CREATE.mockResolvedValueOnce({ results: MOCK_RESULTS });

      const provider = new PerplexitySearchProvider({ maxResults: 2, maxTokensPerPage: 512 });
      const res = await provider.search('AI tools in 2025');

      expect(SHARED_CREATE).toHaveBeenCalledWith({
        query: 'AI tools in 2025',
        max_results: 2,
        max_tokens_per_page: 512,
      });

      expect(res).toEqual(MOCK_RESULTS);
    });

    it('handles optional max_results and tokens by sending defaults when not specified', async () => {
      // provider default constructor sets maxResults=5 and maxTokensPerPage=1024
      SHARED_CREATE.mockResolvedValueOnce({ results: MOCK_RESULTS });

      const provider = new PerplexitySearchProvider();
      await provider.search('modern LLM architectures');

      const args = SHARED_CREATE.mock.calls[0]?.[0] as {
        query: string;
        max_results?: number;
        max_tokens_per_page?: number;
      } | undefined;

      expect(args).toBeDefined();
      expect(args).toHaveProperty('query', 'modern LLM architectures');
      // provider sets defaults; tests should expect those defaults to be present
      expect(args).toHaveProperty('max_results', 5);
      expect(args).toHaveProperty('max_tokens_per_page', 1024);
    });

    it('returns empty array if Perplexity returns no results', async () => {
      SHARED_CREATE.mockResolvedValueOnce({ results: [] });

      const provider = new PerplexitySearchProvider();
      const results = await provider.search('nonexistent query');
      expect(results).toEqual([]);
    });

    it('throws helpful error when API call fails', async () => {
      SHARED_CREATE.mockRejectedValueOnce(new Error('Network error'));

      const provider = new PerplexitySearchProvider();
      await expect(provider.search('AI')).rejects.toThrow('Perplexity API call failed: Network error');
    });
  });

  describe('Error and schema validation', () => {
    it('throws when query is empty', async () => {
      const provider = new PerplexitySearchProvider();
      await expect(provider.search('')).rejects.toThrow('Search query cannot be empty.');
    });

    it('validates mock schema using createMockPerplexityClient', async () => {
      const fn = vi.fn().mockResolvedValue({});
      const client = createMockPerplexityClient(fn);
      await client.search.create({ query: 'test query', max_results: 3 });
      expect(fn).toHaveBeenCalledWith({ query: 'test query', max_results: 3 });
    });
  });

  describe('Debug logging', () => {
    it('logs debug info when debug is enabled', async () => {
      SHARED_CREATE.mockResolvedValueOnce({ results: MOCK_RESULTS });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const provider = new PerplexitySearchProvider({ debug: true });

      await provider.search('test query');

      // provider emits Perplexity-specific debug messages
      expect(logSpy).toHaveBeenCalledWith('[Perplexity] Searching: "test query"');
      expect(logSpy).toHaveBeenCalledWith('[Perplexity] Found 2 results');
      // provider also logs a preview of results (array), accept any array
      expect(logSpy).toHaveBeenCalledWith(expect.any(Array));

      logSpy.mockRestore();
    });

    it('does not log when debug is disabled', async () => {
      SHARED_CREATE.mockResolvedValueOnce({ results: MOCK_RESULTS });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const provider = new PerplexitySearchProvider({ debug: false });

      await provider.search('test query');

      expect(logSpy).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });
});
