import { z } from 'zod';

export const OPENAI_MESSAGE_SCHEMA = z.object({
  content: z.string().nullable(),
  role: z.string().optional(),
  tool_calls: z.array(z.object({
    id: z.string().optional(),
    type: z.literal('function').optional(),
    function: z.object({
      name: z.string().optional(),
      arguments: z.string(),
    }),
  })).optional(),
});

export const OPENAI_CHOICE_SCHEMA = z.object({
  index: z.number().optional(),
  message: OPENAI_MESSAGE_SCHEMA,
  finish_reason: z.string(),
  logprobs: z.unknown().nullable().optional(),
});

export const OPENAI_USAGE_SCHEMA = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
});

export const OPENAI_RESPONSE_SCHEMA = z.object({
  id: z.string().optional(),
  object: z.string().optional(),
  created: z.number().optional(),
  model: z.string().optional(),
  choices: z.array(OPENAI_CHOICE_SCHEMA).min(1),
  usage: OPENAI_USAGE_SCHEMA.optional(),
  system_fingerprint: z.string().optional(),
});

// Inferred TypeScript types
export type OpenAIMessage = z.infer<typeof OPENAI_MESSAGE_SCHEMA>;
export type OpenAIChoice = z.infer<typeof OPENAI_CHOICE_SCHEMA>;
export type OpenAIUsage = z.infer<typeof OPENAI_USAGE_SCHEMA>;
export type OpenAIResponse = z.infer<typeof OPENAI_RESPONSE_SCHEMA>;

// Tool call specific types
export type OpenAIToolCall = NonNullable<OpenAIMessage['tool_calls']>[number];
export type OpenAIFunction = OpenAIToolCall['function'];