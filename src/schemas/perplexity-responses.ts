import { z } from 'zod';

/**
 * Schema for a single Perplexity search result.
 * Provides defaults for missing fields to handle API inconsistencies.
 */
export const PERPLEXITY_RESULT_SCHEMA = z.object({
  title: z.string().default('Untitled'),
  snippet: z.string().default(''),
  url: z.string().default(''),
  date: z.string().default(''),
});

/**
 * Schema for Perplexity API search response.
 * Validates the response structure and normalizes results array.
 */
export const PERPLEXITY_RESPONSE_SCHEMA = z.object({
  results: z.array(PERPLEXITY_RESULT_SCHEMA).default([]),
});

export type PerplexityResult = z.infer<typeof PERPLEXITY_RESULT_SCHEMA>;
export type PerplexityResponse = z.infer<typeof PERPLEXITY_RESPONSE_SCHEMA>;
