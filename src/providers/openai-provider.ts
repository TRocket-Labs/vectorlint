import OpenAI from 'openai';
import { z } from 'zod';
import { LLMProvider } from './llm-provider';
import { DefaultRequestBuilder, RequestBuilder } from './request-builder';
import { OPENAI_RESPONSE_SCHEMA, type OpenAIResponse } from '../schemas/openai-responses';
import { ValidationError, APIResponseError } from '../errors/validation-errors';
import { handleUnknownError } from '../errors/index';

export interface OpenAIConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  debug?: boolean;
  showPrompt?: boolean;
  showPromptTrunc?: boolean;
  debugJson?: boolean;
}

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private config: OpenAIConfig;
  private builder: RequestBuilder;

  constructor(config: OpenAIConfig, builder?: RequestBuilder) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      maxRetries: 2,
    });
    this.config = {
      ...config,
      model: config.model ?? 'gpt-4o',
      temperature: config.temperature ?? 0.2,
    };
    this.builder = builder ?? new DefaultRequestBuilder();
  }

  /**
   * Validates OpenAI API response using schema validation
   * Replaces unsafe type assertions with proper runtime validation
   */
  private validateResponse(response: unknown): OpenAIResponse {
    try {
      return OPENAI_RESPONSE_SCHEMA.parse(response);
    } catch (e: unknown) {
      if (e instanceof z.ZodError) {
        throw new APIResponseError(
          `Invalid OpenAI API response structure: ${e.message}`,
          response,
          e
        );
      }
      const err = handleUnknownError(e, 'OpenAI response validation');
      throw new ValidationError(`OpenAI response validation failed: ${err.message}`, e);
    }
  }

  async runPromptStructured<T = unknown>(
    content: string,
    promptText: string,
    schema: { name: string; schema: Record<string, unknown> }
  ): Promise<T> {
    const systemPrompt = this.builder.buildPromptBodyForStructured(promptText);

    const params: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
      model: this.config.model!,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Input:\n\n${content}` }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: schema.name,
          schema: schema.schema,
        },
      },
    };

    if (this.config.temperature !== undefined) {
      params.temperature = this.config.temperature;
    }

    if (this.config.debug) {
      console.log('[vectorlint] Sending request to OpenAI:', {
        model: this.config.model,
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

    let rawResponse: unknown;
    try {
      rawResponse = await this.client.chat.completions.create(params);
    } catch (e: unknown) {
      // Handle specific OpenAI SDK errors - check more specific errors first
      if (e instanceof OpenAI.RateLimitError) {
        throw new Error(`OpenAI rate limit exceeded: ${e.message}`);
      }
      if (e instanceof OpenAI.AuthenticationError) {
        throw new Error(`OpenAI authentication failed: ${e.message}`);
      }
      if (e instanceof OpenAI.APIError) {
        throw new Error(`OpenAI API error (${e.status}): ${e.message}`);
      }
      
      const err = handleUnknownError(e, 'OpenAI API call');
      throw new Error(`OpenAI API call failed: ${err.message}`);
    }

    // Validate the API response structure using schema validation
    const validatedResponse = this.validateResponse(rawResponse);

    // Debug logging after successful response
    if (this.config.debug) {
      const usage = validatedResponse.usage;
      const firstChoice = validatedResponse.choices[0];
      if (usage || firstChoice) {
        console.log('[vectorlint] LLM response meta:', { 
          usage: usage ? {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
          } : undefined,
          finish_reason: firstChoice?.finish_reason,
        });
      }
      if (this.config.debugJson) {
        try {
          console.log('[vectorlint] Full JSON response:');
          console.log(JSON.stringify(rawResponse, null, 2));
        } catch (e: unknown) {
          const err = handleUnknownError(e, 'JSON stringify for debug');
          console.warn(`[vectorlint] Warning: ${err.message}`);
        }
      }
    }

    // Type-safe property access with proper null checks
    const firstChoice = validatedResponse.choices[0];
    if (!firstChoice) {
      throw new Error('Empty response from OpenAI API (no choices).');
    }

    const responseText = firstChoice.message.content?.trim();
    if (!responseText) {
      throw new Error('Empty response from OpenAI API (no content).');
    }

    try {
      return JSON.parse(responseText) as T;
    } catch (e: unknown) {
      const err = handleUnknownError(e, 'JSON parsing');
      const preview = responseText.slice(0, 200);
      throw new ValidationError(
        `Failed to parse structured JSON response: ${err.message}. Preview: ${preview}${responseText.length > 200 ? ' ...' : ''}`,
        e
      );
    }
  }
}