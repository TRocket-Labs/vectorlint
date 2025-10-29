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

    const params: Anthropic.Messages.MessageCreateParamsNonStreaming = {
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
      response = await this.client.messages.create(params);
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

  private extractStructuredResponse<T>(response: Anthropic.Messages.Message, expectedToolName: string): T {
    if (this.config.debug) {
      const usage = response.usage;
      const stopReason = response.stop_reason;
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

    // Validate response has content
    if (!response.content || response.content.length === 0) {
      throw new Error('Empty response from Anthropic API (no content blocks).');
    }

    // Find tool use in response content
    const toolUse = response.content.find(
      (block): block is Anthropic.Messages.ToolUseBlock => 
        block.type === 'tool_use' && block.name === expectedToolName
    );

    if (!toolUse) {
      // Check if there are any tool use blocks at all
      const hasAnyToolUse = response.content.some(block => block.type === 'tool_use');
      if (hasAnyToolUse) {
        const availableTools = response.content
          .filter((block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use')
          .map(block => block.name);
        throw new Error(`Expected tool call '${expectedToolName}' but received: ${availableTools.join(', ')}`);
      }
      
      // Check if response contains text instead of tool use
      const textBlocks = response.content.filter(block => block.type === 'text');
      if (textBlocks.length > 0) {
        const textContent = textBlocks.map(block => 'text' in block ? block.text : '').join(' ').slice(0, 200);
        throw new Error(`No tool call received for ${expectedToolName}. Response contains text instead: ${textContent}${textContent.length >= 200 ? '...' : ''}`);
      }
      
      throw new Error(`No tool call received for ${expectedToolName}. Response may not contain structured data.`);
    }

    if (!toolUse.input || (typeof toolUse.input === 'object' && Object.keys(toolUse.input).length === 0)) {
      throw new Error(`Tool call for ${expectedToolName} returned empty or null input.`);
    }

    // Validate that the input is a valid object
    if (typeof toolUse.input !== 'object' || toolUse.input === null) {
      throw new Error(`Tool call for ${expectedToolName} returned invalid input type: ${typeof toolUse.input}`);
    }

    return toolUse.input as T;
  }
}