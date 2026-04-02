import { generateText } from 'ai';
import { z } from 'zod';
import { createPerplexity } from '@ai-sdk/perplexity';
import type { SearchProvider } from './search-provider';
import type { PerplexityResult } from '../schemas/perplexity-responses';
import { createNoopLogger, type Logger } from '../logging/logger';
import { handleUnknownError } from '../errors';

// Boundary validation schema for Perplexity source data.
// The AI SDK's typed Source may not include provider-specific fields (text, publishedDate),
// so we validate the raw data at the boundary to safely extract them.
const PERPLEXITY_SOURCE_SCHEMA = z.object({
  title: z.string().optional(),
  text: z.string().optional(),
  url: z.string().optional(),
  publishedDate: z.string().optional(),
}).passthrough();
const PERPLEXITY_SOURCES_SCHEMA = z.array(PERPLEXITY_SOURCE_SCHEMA);

export interface PerplexitySearchConfig {
  apiKey?: string;
  maxResults?: number;
  logger?: Logger;
}

export class PerplexitySearchProvider implements SearchProvider {
  private client: ReturnType<typeof createPerplexity>;
  private maxResults: number;
  private logger: Logger;

  constructor(config: PerplexitySearchConfig = {}) {
    // Use provided API key or fall back to environment variable
    const apiKey = config.apiKey || process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      throw new Error('Perplexity API key is required. Set PERPLEXITY_API_KEY environment variable or pass apiKey in config.');
    }
    this.client = createPerplexity({ apiKey });
    this.maxResults = config.maxResults ?? 5;
    this.logger = config.logger ?? createNoopLogger();
  }

  async search(query: string): Promise<PerplexityResult[]> {
    if (!query?.trim()) throw new Error('Search query cannot be empty.');

    this.logger.debug('Perplexity search started', { query });

    try {
      const result = await generateText({
        model: this.client('sonar-pro'),
        prompt: query,
      });

      // Validate sources at the boundary — the SDK may include provider-specific
      // fields not present in the typed Source interface
      const rawSources: unknown[] = Array.isArray(result.sources) ? result.sources.slice(0, this.maxResults) : [];
      const parseResult = PERPLEXITY_SOURCES_SCHEMA.safeParse(rawSources);
      if (!parseResult.success) {
        this.logger.warn('Perplexity source validation failed', {
          error: parseResult.error.message,
        });
      }
      const sources = parseResult.success ? parseResult.data : [];

      const results: PerplexityResult[] = sources.map(source => ({
        title: source.title || 'Untitled',
        snippet: source.text || '',
        url: source.url || '',
        date: source.publishedDate || '',
      }));

      this.logger.debug('Perplexity search completed', { resultCount: results.length });
      this.logger.debug('Perplexity result preview', {
        results: results.slice(0, 2),
      });

      return results;
    } catch (e: unknown) {
      const err = handleUnknownError(e, 'Perplexity API call');
      throw new Error(`Perplexity API call failed: ${err.message}`);
    }
  }
}
