import Perplexity from '@perplexity-ai/perplexity_ai';
import type { SearchProvider } from './search-provider';
import { PERPLEXITY_RESPONSE_SCHEMA, type PerplexityResult } from '../schemas/perplexity-responses';

export interface PerplexitySearchConfig {
  maxResults?: number;
  maxTokensPerPage?: number;
  debug?: boolean;
}

export class PerplexitySearchProvider implements SearchProvider {
  private client: Perplexity;
  private maxResults: number;
  private maxTokensPerPage: number;
  private debug: boolean;

  constructor(config: PerplexitySearchConfig = {}) {
    this.client = new Perplexity();
    this.maxResults = config.maxResults ?? 5;
    this.maxTokensPerPage = config.maxTokensPerPage ?? 1024;
    this.debug = config.debug ?? false;
  }

  async search(query: string): Promise<PerplexityResult[]> {
    if (!query?.trim()) throw new Error('Search query cannot be empty.');

    if (this.debug) console.error(`[Perplexity] Searching: "${query}"`);
    try {
      const rawResponse: unknown = await this.client.search.create({
        query,
        max_results: this.maxResults,
        max_tokens_per_page: this.maxTokensPerPage,
      });

      /*
       * Validate response with schema at boundary.
       * Schema provides defaults for missing fields and ensures type safety.
       */
      const validated = PERPLEXITY_RESPONSE_SCHEMA.parse(rawResponse);
      const results = validated.results;

      if (this.debug) {
        console.error(`[Perplexity] Found ${results.length} results`);
        console.error(results.slice(0, 2));
      }

      return results;
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      throw new Error(`Perplexity API call failed: ${err.message}`);
    }
  }
}
