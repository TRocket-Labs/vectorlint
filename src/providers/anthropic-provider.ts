import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { LLMProvider } from './llm-provider';
import { DefaultRequestBuilder, RequestBuilder } from './request-builder';
import {
  ANTHROPIC_RESPONSE_SCHEMA,
  type AnthropicResponse,
  type AnthropicToolUseBlock,
  isToolUseBlock,
  isTextBlock
} from '../schemas/anthropic-responses';
import { ValidationError, APIResponseError } from '../errors/validation-errors';
import { handleUnknownError } from '../errors/index';

export interface AnthropicConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  debug?: boolean;
  showPrompt?: boolean;
  showPromptTrunc?: boolean;
  debugJson?: boolean;
}

export const ANTHROPIC_DEFAULT_CONFIG = {
  model: 'claude-3-sonnet-20240229',
  maxTokens: 4096,
  temperature: 0.2,
};

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private config: AnthropicConfig;
  private builder: RequestBuilder;

  constructor(config: AnthropicConfig, builder?: RequestBuilder) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      maxRetries: 2,
    });
    this.config = {
      ...config,
      model: config.model ?? ANTHROPIC_DEFAULT_CONFIG.model,
      maxTokens: config.maxTokens ?? ANTHROPIC_DEFAULT_CONFIG.maxTokens,
      temperature: config.temperature ?? ANTHROPIC_DEFAULT_CONFIG.temperature,
    };
    this.builder = builder ?? new DefaultRequestBuilder();
  }

  /**
   * Validates Anthropic API response using schema validation
   * Replaces unsafe type assertions with proper runtime validation
   */
  private validateResponse(response: unknown): AnthropicResponse {
    try {
      return ANTHROPIC_RESPONSE_SCHEMA.parse(response);
    } catch (e: unknown) {
      if (e instanceof z.ZodError) {
        throw new APIResponseError(
          `Invalid Anthropic API response structure: ${e.message}`,
          response,
          e
        );
      }
      const err = handleUnknownError(e, 'Anthropic response validation');
      throw new ValidationError(`Anthropic response validation failed: ${err.message}`, e);
    }
  }

  async runPromptStructured<T = unknown>(
    content: string,
    promptText: string,
    schema: { name: string; schema: Record<string, unknown> }
  ): Promise<T> {
    const systemPrompt = this.builder.buildPromptBodyForStructured(promptText);

    // Create tool schema for structured response
    const toolSchema = this.convertToAnthropicToolSchema(schema);

    // Create request with both official Anthropic fields and E2E mock compatibility aliases
    const params: Anthropic.Messages.MessageCreateParams & Record<string, unknown> = {
      // Official Anthropic fields (snake_case)
      model: this.config.model!,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Input:\n\n${content}`,
        },
      ],
      max_tokens: this.config.maxTokens!,
      tools: [toolSchema],
      tool_choice: { type: 'tool', name: schema.name },

      // E2E mock compatibility aliases (camelCase)
      maxTokens: this.config.maxTokens!,
      toolChoice: { type: 'tool', name: schema.name },
    };

    if (this.config.temperature !== undefined) {
      params.temperature = this.config.temperature;
    }

    if (this.config.debug) {
      console.log('[vectorlint] Sending request to Anthropic:', {
        model: this.config.model,
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });
      if (this.config.showPrompt) {
        console.log('[vectorlint] System prompt (full):');
        console.log(systemPrompt);
        console.log('[vectorlint] User content (full):');
        console.log(content);
      } else if (this.config.showPromptTrunc) {
        console.log('[vectorlint] System prompt (first 500 chars):');
        console.log(systemPrompt.slice(0, 500));
        if (systemPrompt.length > 500) console.log('... [truncated]');
        const preview = content.slice(0, 500);
        console.log('[vectorlint] User content preview (first 500 chars):');
        console.log(preview);
        if (content.length > 500) console.log('... [truncated]');
      }
    }

    // Create clean params for Anthropic API (remove E2E mock compatibility fields)
    const anthropicParams: Anthropic.Messages.MessageCreateParams = {
      model: params.model,
      system: params.system,
      messages: params.messages,
      max_tokens: params.max_tokens,
      tools: params.tools,
      tool_choice: params.tool_choice,
      ...(params.temperature !== undefined && { temperature: params.temperature }),
    };

    let rawResponse: unknown;
    try {
      rawResponse = await this.client.messages.create(anthropicParams);
    } catch (e: unknown) {
      // Handle specific Anthropic SDK errors
      if (e instanceof Anthropic.APIError) {
        throw new Error(`Anthropic API error (${e.status}): ${e.message}`);
      }
      if (e instanceof Anthropic.RateLimitError) {
        throw new Error(`Anthropic rate limit exceeded: ${e.message}`);
      }
      if (e instanceof Anthropic.AuthenticationError) {
        throw new Error(`Anthropic authentication failed: ${e.message}`);
      }
      if (e instanceof Anthropic.BadRequestError) {
        throw new Error(`Anthropic bad request: ${e.message}`);
      }

      const err = handleUnknownError(e, 'Anthropic API call');
      throw new Error(`Anthropic API call failed: ${err.message}`);
    }

    // Validate the API response structure using schema validation
    const validatedResponse = this.validateResponse(rawResponse);

    return this.extractStructuredResponse<T>(validatedResponse, schema.name);
  }

  private convertToAnthropicToolSchema(schema: { name: string; schema: Record<string, unknown> }): Anthropic.Messages.Tool {
    return {
      name: schema.name,
      description: `Submit ${schema.name} evaluation results`,
      input_schema: {
        type: 'object',
        ...schema.schema,
      },
    };
  }

  private extractStructuredResponse<T>(response: AnthropicResponse, expectedToolName: string): T {
    // Debug logging with type-safe property access
    if (this.config.debug) {
      const usage = response.usage;
      const stopReason = response.stop_reason;
      if (usage || stopReason) {
        console.log('[vectorlint] LLM response meta:', {
          usage: {
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
          },
          stop_reason: stopReason,
        });
      }
      if (this.config.debugJson) {
        try {
          console.log('[vectorlint] Full JSON response:');
          console.log(JSON.stringify(response, null, 2));
        } catch (e: unknown) {
          const err = handleUnknownError(e, 'JSON stringify for debug');
          console.warn(`[vectorlint] Warning: ${err.message}`);
        }
      }
    }

    // Type-safe content validation - response is already validated by schema
    const blocks = response.content;
    if (blocks.length === 0) {
      throw new Error('Empty response from Anthropic API (no content blocks).');
    }

    // Find the expected tool use block using type-safe filtering
    const toolBlock = blocks.find((block): block is AnthropicToolUseBlock =>
      isToolUseBlock(block) && block.name === expectedToolName
    );

    if (!toolBlock) {
      // Check if there are any tool use blocks at all
      const toolUseBlocks = blocks.filter(isToolUseBlock);
      if (toolUseBlocks.length > 0) {
        const availableTools = toolUseBlocks.map(block => block.name);
        throw new Error(`Expected tool call '${expectedToolName}' but received: ${availableTools.join(', ')}`);
      }

      // Check if response contains text instead of tool use
      const textBlocks = blocks.filter(isTextBlock);
      if (textBlocks.length > 0) {
        const textContent = textBlocks[0].text.slice(0, 200);
        throw new Error(`No tool call received for ${expectedToolName}. Response contains text instead: ${textContent}${textContent.length >= 200 ? '...' : ''}`);
      }

      throw new Error(`No tool call received for ${expectedToolName}. Response may not contain structured data.`);
    }

    const input = toolBlock.input;
    if (input == null || (typeof input === 'object' && !Array.isArray(input) && Object.keys(input).length === 0)) {
      throw new Error(`Tool call for ${expectedToolName} returned empty or null input.`);
    }

    if (typeof input !== 'object' || Array.isArray(input)) {
      throw new Error(`Tool call for ${expectedToolName} returned invalid input type: ${typeof input}`);
    }

    return input as T;
  }
}
