import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider } from './llm-provider';
import { DefaultRequestBuilder, RequestBuilder } from './request-builder';
import { validateAnthropicResponse } from '../boundaries/api-client';
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
      model: config.model ?? 'claude-3-sonnet-20240229',
      maxTokens: config.maxTokens ?? 4096,
      temperature: config.temperature ?? 0.2,
    };
    this.builder = builder ?? new DefaultRequestBuilder();
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
    const params: any = {
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

    let response: Anthropic.Messages.Message;
    try {
      response = await (this.client as any).messages.create(params);
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

    // Validate the API response structure
    let validatedResponse;
    try {
      validatedResponse = validateAnthropicResponse(response);
    } catch (e: unknown) {
      const err = handleUnknownError(e, 'Anthropic API response validation');
      throw new Error(`Invalid Anthropic API response structure: ${err.message}`);
    }

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

  private extractStructuredResponse<T>(response: any, expectedToolName: string): T {
    // 1) Guard first - check if response exists at all
    if (!response) {
      throw new Error('Empty response from Anthropic API (no content blocks).');
    }

    // 2) Debug after we know response exists
    if (this.config.debug) {
      const usage = (response as any).usage;
      const stopReason = (response as any).stop_reason;
      if (usage || stopReason) {
        console.log('[vectorlint] LLM response meta:', { 
          usage: {
            input_tokens: usage?.input_tokens,
            output_tokens: usage?.output_tokens,
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

    // 3) Content check that cannot throw on undefined
    const blocks = (response as any).content;
    if (!Array.isArray(blocks) || blocks.length === 0) {
      throw new Error('Empty response from Anthropic API (no content blocks).');
    }

    // 4) Tool block checks
    const toolBlock = blocks.find((b: any) => b?.type === 'tool_use' && b?.name === expectedToolName);
    
    if (!toolBlock) {
      // Check if there are any tool use blocks at all
      const hasAnyToolUse = blocks.some((b: any) => b?.type === 'tool_use');
      if (hasAnyToolUse) {
        const availableTools = blocks
          .filter((b: any) => b?.type === 'tool_use')
          .map((b: any) => b?.name)
          .filter(Boolean);
        throw new Error(`Expected tool call '${expectedToolName}' but received: ${availableTools.join(', ')}`);
      }
      
      // Check if response contains text instead of tool use
      const textBlock = blocks.find((b: any) => b?.type === 'text');
      if (textBlock) {
        const textContent = (textBlock.text ?? '').slice(0, 200);
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