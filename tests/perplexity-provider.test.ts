import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PerplexitySearchProvider } from '../src/providers/perplexity-provider';
import { createMockLogger } from './utils';


// Mock the Vercel AI SDK — use vi.hoisted so the mock is available in the vi.mock factory
const MOCK_GENERATE_TEXT = vi.hoisted(() => vi.fn());

vi.mock('ai', () => ({
  generateText: MOCK_GENERATE_TEXT,
}));

vi.mock('@ai-sdk/perplexity', () => ({
  createPerplexity: vi.fn(() => vi.fn((model: string) => ({ _type: 'perplexity', model }))),
}));

// Mock data matching the raw Perplexity API source shape (uses `text`, not `snippet`)
const MOCK_SOURCES = [
  {
    title: 'AI Overview',
    text: 'AI tools in 2025 are evolving fast.',
    url: 'https://example.com/ai-overview',
  },
  {
    title: 'Developer Productivity',
    text: 'AI improves developer efficiency by 40%.',
    url: 'https://example.com/dev-productivity',
  },
];

// Expected mapped output (provider maps `text` → `snippet`, adds `date` default)
const EXPECTED_RESULTS = [
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
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock process.env.PERPLEXITY_API_KEY for tests
    process.env.PERPLEXITY_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe('Constructor', () => {
    it('initializes with defaults using environment variable', () => {
      const provider = new PerplexitySearchProvider();
      expect(provider).toBeInstanceOf(PerplexitySearchProvider);
    });

    it('accepts override config with apiKey', () => {
      const provider = new PerplexitySearchProvider({ apiKey: 'custom-key', maxResults: 10 });
      expect(provider).toBeInstanceOf(PerplexitySearchProvider);
    });

    it('throws error when no API key is provided', () => {
      delete process.env.PERPLEXITY_API_KEY;
      expect(() => new PerplexitySearchProvider()).toThrow('Perplexity API key is required');
    });

    it('accepts partial config with maxResults', () => {
      const provider = new PerplexitySearchProvider({ maxResults: 2 });
      expect(provider).toBeInstanceOf(PerplexitySearchProvider);
    });
  });

  describe('search', () => {
    it('executes search query successfully', async () => {
      MOCK_GENERATE_TEXT.mockResolvedValue({
        sources: MOCK_SOURCES,
      });

      const provider = new PerplexitySearchProvider({ maxResults: 2 });
      const results = await provider.search('AI tools for developers');

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual(EXPECTED_RESULTS[0]);
    });

    it('throws error for empty query', async () => {
      const provider = new PerplexitySearchProvider();

      await expect(provider.search('')).rejects.toThrow('Search query cannot be empty');
      await expect(provider.search('   ')).rejects.toThrow('Search query cannot be empty');
    });

    it('handles empty sources array', async () => {
      MOCK_GENERATE_TEXT.mockResolvedValue({
        sources: [],
      });

      const provider = new PerplexitySearchProvider();
      const results = await provider.search('unknown topic');

      expect(results).toHaveLength(0);
    });

    it('limits results to maxResults', async () => {
      const manyResults = Array.from({ length: 10 }, (_, i) => ({
        title: `Result ${i}`,
        text: `Snippet ${i}`,
        url: `https://example.com/${i}`,
        publishedDate: '',
      }));

      MOCK_GENERATE_TEXT.mockResolvedValue({
        sources: manyResults,
      });

      const provider = new PerplexitySearchProvider({ maxResults: 5 });
      const results = await provider.search('test query');

      expect(results).toHaveLength(5);
    });

    // This test relies on PERPLEXITY_SOURCE_SCHEMA marking all fields as optional
    // with .passthrough(), so objects with missing fields still pass validation.
    it('handles missing fields gracefully', async () => {
      const incompleteResults = [
        {
          // Missing all fields
        },
        {
          title: 'Has Title',
          // Missing other fields
        },
        {
          text: 'Has snippet',
          url: 'https://example.com',
          publishedDate: '2025-01-01',
        },
      ];

      MOCK_GENERATE_TEXT.mockResolvedValue({
        sources: incompleteResults,
      });

      const provider = new PerplexitySearchProvider();
      const results = await provider.search('test');

      expect(results).toHaveLength(3);
      expect(results[0]!.title).toBe('Untitled');
      expect(results[0]!.snippet).toBe('');
      expect(results[1]!.title).toBe('Has Title');
      expect(results[1]!.snippet).toBe('');
    });
  });

  describe('Logging', () => {
    const logger = createMockLogger();

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('logs the search query through the injected logger', async () => {
      MOCK_GENERATE_TEXT.mockResolvedValue({
        sources: MOCK_SOURCES,
      });

      const provider = new PerplexitySearchProvider({ logger });
      await provider.search('test query');

      expect(logger.debug).toHaveBeenCalledWith('Perplexity search started', {
        query: 'test query',
      });
    });

    it('logs the result count through the injected logger', async () => {
      MOCK_GENERATE_TEXT.mockResolvedValue({
        sources: MOCK_SOURCES,
      });

      const provider = new PerplexitySearchProvider({ logger });
      await provider.search('test query');

      expect(logger.debug).toHaveBeenCalledWith('Perplexity search completed', {
        resultCount: 2,
      });
    });

    it('logs a structured result preview', async () => {
      MOCK_GENERATE_TEXT.mockResolvedValue({
        sources: MOCK_SOURCES,
      });

      const provider = new PerplexitySearchProvider({ logger });
      await provider.search('test query');

      expect(logger.debug).toHaveBeenCalledWith('Perplexity result preview', {
        results: EXPECTED_RESULTS,
      });
    });

    it('warns when source validation fails', async () => {
      MOCK_GENERATE_TEXT.mockResolvedValue({
        sources: [null],
      });

      const provider = new PerplexitySearchProvider({ logger });
      const results = await provider.search('test query');

      expect(results).toEqual([]);
      expect(logger.warn).toHaveBeenCalled();
      const warnCall = logger.warn.mock.calls.at(-1);
      expect(warnCall?.[0]).toBe('Perplexity source validation failed');
      const warnMeta: unknown = warnCall?.[1];
      expect(warnMeta).toBeDefined();
      expect(warnMeta).not.toBeNull();
      expect(typeof warnMeta).toBe('object');
      if (!warnMeta || typeof warnMeta !== 'object' || !('error' in warnMeta)) {
        throw new Error('Expected warning metadata with an error field');
      }
      expect(warnMeta.error).toContain('Expected object, received null');
    });
  });

  describe('Error Handling', () => {
    it('throws descriptive error for API failures', async () => {
      MOCK_GENERATE_TEXT.mockRejectedValue(new Error('Network error'));

      const provider = new PerplexitySearchProvider();

      await expect(provider.search('test')).rejects.toThrow('Perplexity API call failed: Network error');
    });

    it('handles unknown error types', async () => {
      MOCK_GENERATE_TEXT.mockRejectedValue('String error');

      const provider = new PerplexitySearchProvider();

      await expect(provider.search('test')).rejects.toThrow('Perplexity API call failed: Perplexity API call: String error');
    });
  });

  describe('Configuration', () => {
    it('returns all sources when maxResults exceeds available count', async () => {
      const results = Array.from({ length: 3 }, (_, i) => ({
        title: `Result ${i}`,
        text: `Snippet ${i}`,
        url: `https://example.com/${i}`,
        publishedDate: '',
      }));

      MOCK_GENERATE_TEXT.mockResolvedValue({ sources: results });

      const provider = new PerplexitySearchProvider({ maxResults: 10 });
      const searchResults = await provider.search('test');

      // maxResults (10) > available sources (3), so all 3 should be returned
      expect(searchResults).toHaveLength(3);
    });

    it('uses default maxResults when not specified', async () => {
      const results = Array.from({ length: 10 }, (_, i) => ({
        title: `Result ${i}`,
        text: `Snippet ${i}`,
        url: `https://example.com/${i}`,
        publishedDate: '',
      }));

      MOCK_GENERATE_TEXT.mockResolvedValue({ sources: results });

      const provider = new PerplexitySearchProvider();
      const searchResults = await provider.search('test');

      // Default maxResults is 5
      expect(searchResults).toHaveLength(5);
    });
  });
});
