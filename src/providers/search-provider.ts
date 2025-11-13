import Perplexity from '@perplexity-ai/perplexity_ai';

/**
 * Search provider interface for real-time information retrieval.
 * Allows swapping search implementations (Perplexity, Google, Bing, etc.)
 */
export interface SearchProvider {
  /**
   * Search for information about a query
   * @param query - Search query string
   * @returns Search results with sources and optional summary
   */
  search(query: string): Promise<SearchResult>;
}

/**
 * Result from a search query
 */
export interface SearchResult {
  query: string;           // Original query
  sources: SearchSource[]; // Array of sources found
  summary?: string;        // Optional summary of findings
}

/**
 * Individual source from search results
 */
export interface SearchSource {
  title: string;           // Source title
  url: string;             // Source URL
  snippet: string;         // Relevant excerpt
  publishedDate?: string;  // Optional publication date
}

/**
 * Perplexity API implementation of SearchProvider.
 * Uses Perplexity's search API for real-time information retrieval.
 */
export class PerplexityProvider implements SearchProvider {
  private client: Perplexity;
  private maxResults: number;
  private maxTokensPerPage: number;

  constructor(apiKey?: string, options: { maxResults?: number; maxTokensPerPage?: number } = {}) {
    // Validate API key
    const key = apiKey || process.env.PERPLEXITY_API_KEY;
    if (!key) {
      throw new Error(
        'PERPLEXITY_API_KEY is required. Set it in your environment or pass it to the constructor.'
      );
    }

    this.client = new Perplexity({ apiKey: key });
    this.maxResults = options.maxResults ?? 5;
    this.maxTokensPerPage = options.maxTokensPerPage ?? 1024;
  }

  /**
   * Search for information using Perplexity API
   * @param query - Search query string
   * @returns Search results with sources
   */
  async search(query: string): Promise<SearchResult> {
    if (!query?.trim()) {
      throw new Error('Search query cannot be empty');
    }

    try {
      const response = await this.client.search.create({
        query,
        max_results: this.maxResults,
        max_tokens_per_page: this.maxTokensPerPage,
      });

      // Transform Perplexity results to SearchSource format
      const sources: SearchSource[] = (response?.results ?? []).map((r: any) => ({
        title: r.title || 'Untitled',
        url: r.url || '',
        snippet: r.snippet || '',
        publishedDate: r.date || undefined,
      }));

      return {
        query,
        sources,
        // Perplexity search API doesn't provide a summary, so we omit it
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      throw new Error(`Perplexity API search failed: ${error.message}`);
    }
  }
}
