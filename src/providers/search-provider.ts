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
      // Parse error for better messaging
      let errorMessage = 'Unknown error';
      
      if (err instanceof Error) {
        errorMessage = err.message;
        
        // Check for common API errors
        if (errorMessage.includes('401')) {
          throw new Error(
            'Perplexity API authentication failed (401). ' +
            'Please check that PERPLEXITY_API_KEY is set correctly in your .env file.'
          );
        } else if (errorMessage.includes('429')) {
          throw new Error(
            'Perplexity API rate limit exceeded (429). ' +
            'Please wait a moment and try again.'
          );
        } else if (errorMessage.includes('403')) {
          throw new Error(
            'Perplexity API access forbidden (403). ' +
            'Please verify your API key has the required permissions.'
          );
        } else if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503')) {
          throw new Error(
            'Perplexity API server error. The service may be temporarily unavailable.'
          );
        }
      }
      
      throw new Error(`Perplexity API search failed: ${errorMessage}`);
    }
  }
}
