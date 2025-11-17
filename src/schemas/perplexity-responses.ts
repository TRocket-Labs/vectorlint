import { z } from 'zod';
export const PERPLEXITY_RESULT_SCHEMA = z.object({
  title: z.string().default('Untitled'),
  snippet: z.string().default(''),
  url: z.string().default(''),
  date: z.string().default(''),
});

export const PERPLEXITY_RESPONSE_SCHEMA = z.object({
  results: z.array(PERPLEXITY_RESULT_SCHEMA).default([]),
});

export type PerplexityResult = z.infer<typeof PERPLEXITY_RESULT_SCHEMA>;
export type PerplexityResponse = z.infer<typeof PERPLEXITY_RESPONSE_SCHEMA>;
