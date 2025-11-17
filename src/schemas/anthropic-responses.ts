import { z } from 'zod';

export const ANTHROPIC_TEXT_BLOCK_SCHEMA = z.object({
  type: z.literal('text'),
  text: z.string(),
});

export const ANTHROPIC_TOOL_USE_BLOCK_SCHEMA = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.unknown(), // Tool input can be any valid JSON
});

export const ANTHROPIC_CONTENT_BLOCK_SCHEMA = z.discriminatedUnion('type', [
  ANTHROPIC_TEXT_BLOCK_SCHEMA,
  ANTHROPIC_TOOL_USE_BLOCK_SCHEMA,
]);

export const ANTHROPIC_USAGE_SCHEMA = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
});

export const ANTHROPIC_RESPONSE_SCHEMA = z.object({
  id: z.string(),
  type: z.literal('message'),
  role: z.literal('assistant'),
  content: z.array(ANTHROPIC_CONTENT_BLOCK_SCHEMA),
  model: z.string(),
  stop_reason: z.enum(['max_tokens', 'end_turn', 'stop_sequence', 'tool_use']).nullable(),
  stop_sequence: z.string().nullable(),
  usage: ANTHROPIC_USAGE_SCHEMA,
});

// Inferred TypeScript types
export type AnthropicTextBlock = z.infer<typeof ANTHROPIC_TEXT_BLOCK_SCHEMA>;
export type AnthropicToolUseBlock = z.infer<typeof ANTHROPIC_TOOL_USE_BLOCK_SCHEMA>;
export type AnthropicContentBlock = z.infer<typeof ANTHROPIC_CONTENT_BLOCK_SCHEMA>;
export type AnthropicUsage = z.infer<typeof ANTHROPIC_USAGE_SCHEMA>;
export type AnthropicResponse = z.infer<typeof ANTHROPIC_RESPONSE_SCHEMA>;

// Helper type guards
export function isTextBlock(block: AnthropicContentBlock): block is AnthropicTextBlock {
  return block.type === 'text';
}

export function isToolUseBlock(block: AnthropicContentBlock): block is AnthropicToolUseBlock {
  return block.type === 'tool_use';
}