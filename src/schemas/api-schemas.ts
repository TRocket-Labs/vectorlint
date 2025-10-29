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

// Anthropic API response schemas
export const ANTHROPIC_USAGE_SCHEMA = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
});

export const ANTHROPIC_TEXT_BLOCK_SCHEMA = z.object({
  type: z.literal('text'),
  text: z.string(),
});

export const ANTHROPIC_TOOL_USE_BLOCK_SCHEMA = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.record(z.unknown()),
});

export const ANTHROPIC_CONTENT_BLOCK_SCHEMA = z.discriminatedUnion('type', [
  ANTHROPIC_TEXT_BLOCK_SCHEMA,
  ANTHROPIC_TOOL_USE_BLOCK_SCHEMA,
]);

export const ANTHROPIC_MESSAGE_SCHEMA = z.object({
  id: z.string(),
  type: z.literal('message'),
  role: z.literal('assistant'),
  content: z.array(ANTHROPIC_CONTENT_BLOCK_SCHEMA),
  model: z.string(),
  stop_reason: z.enum(['max_tokens', 'end_turn', 'stop_sequence', 'tool_use']).nullable(),
  stop_sequence: z.string().nullable(),
  usage: ANTHROPIC_USAGE_SCHEMA,
});

// Inferred types
export type OpenAIChoice = z.infer<typeof OPENAI_CHOICE_SCHEMA>;
export type OpenAIUsage = z.infer<typeof OPENAI_USAGE_SCHEMA>;
export type OpenAIResponse = z.infer<typeof OPENAI_RESPONSE_SCHEMA>;

export type AnthropicUsage = z.infer<typeof ANTHROPIC_USAGE_SCHEMA>;
export type AnthropicTextBlock = z.infer<typeof ANTHROPIC_TEXT_BLOCK_SCHEMA>;
export type AnthropicToolUseBlock = z.infer<typeof ANTHROPIC_TOOL_USE_BLOCK_SCHEMA>;
export type AnthropicContentBlock = z.infer<typeof ANTHROPIC_CONTENT_BLOCK_SCHEMA>;
export type AnthropicMessage = z.infer<typeof ANTHROPIC_MESSAGE_SCHEMA>;