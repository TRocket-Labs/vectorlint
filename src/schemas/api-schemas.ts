import { z } from 'zod';

// OpenAI API response schemas
export const OPENAI_CHOICE_SCHEMA = z.object({
  message: z.object({
    content: z.string().nullable(),
  }),
  finish_reason: z.string(),
});

export const OPENAI_USAGE_SCHEMA = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
});

export const OPENAI_RESPONSE_SCHEMA = z.object({
  choices: z.array(OPENAI_CHOICE_SCHEMA).min(1),
  usage: OPENAI_USAGE_SCHEMA.optional(),
});

// Inferred types
export type OpenAIChoice = z.infer<typeof OPENAI_CHOICE_SCHEMA>;
export type OpenAIUsage = z.infer<typeof OPENAI_USAGE_SCHEMA>;
export type OpenAIResponse = z.infer<typeof OPENAI_RESPONSE_SCHEMA>;