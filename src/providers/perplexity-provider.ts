import Perplexity from '@perplexity-ai/perplexity_ai';

export interface PerplexitySearchConfig {
  maxResults?: number;
  maxTokensPerPage?: number;
  debug?: boolean;
}

export class PerplexitySearchProvider {
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

  async search(query: string) {
  if (!query?.trim()) throw new Error('Search query cannot be empty.');

  if (this.debug) console.log(`[Perplexity] Searching: "${query}"`);

  try {
    const response = await this.client.search.create({
      query,
      max_results: this.maxResults,
      max_tokens_per_page: this.maxTokensPerPage,
    });

    const results = (response?.results ?? []).map((r: any) => ({
      title: r.title || 'Untitled',
      snippet: r.snippet || '',
      url: r.url || '',
      date: r.date || '',
    }));

    if (this.debug) {
      console.log(`[Perplexity] Found ${results.length} results`);
      console.log(results.slice(0, 2));
    }

    return results;
  } catch (err: any) {
    throw new Error(`Perplexity API call failed: ${err.message}`);
  }
}

}
