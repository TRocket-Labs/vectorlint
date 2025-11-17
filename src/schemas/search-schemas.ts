import { z } from 'zod';

export const SEARCH_SNIPPET_SCHEMA = z.object({
  snippet: z.string(),
  url: z.string(),
  title: z.string().optional(),
  date: z.string().optional(),
});

/**
 * Schema for LLM verification response.
 * Validates the structured output from fact-checking prompts.
 */
export const VERIFICATION_RESPONSE_SCHEMA = z.object({
  status: z.enum(['supported', 'unsupported', 'unverifiable']),
  justification: z.string(),
  link: z.string().optional(),
});

export type SearchSnippet = z.infer<typeof SEARCH_SNIPPET_SCHEMA>;
export type VerificationResponse = z.infer<typeof VERIFICATION_RESPONSE_SCHEMA>;
