import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider } from './llm-provider';
import { DefaultRequestBuilder, RequestBuilder } from './request-builder';
import { handleUnknownError } from '../errors/index';

export interface AnthropicConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
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
    this.config = config;
    this.builder = builder ?? new DefaultRequestBuilder();
  }

  async runPromptStructured<T = unknown>(
    content: string,
    promptText: string,
    schema: { name: string; schema: Record<string, unknown> }
  ): Promise<T> {
    const prompt = this.builder.buildPromptBodyForStructured(promptText);

    const params: Anthropic.Messages.MessageCreateParams = {
      model: this.config.model,
      system: prompt,
      messages: [
        { role: 'user', content: `Input:\n\n${content}` }
      ],
      max_tokens: this.config.maxTokens,
      stream: false,
      tools: [{
        name: 'submit_evaluation',
        description: 'Submit VectorLint content evaluation results',
        input_schema: {
          type: 'object',
          ...schema.schema,
        } as Anthropic.Messages.Tool.InputSchema,
      }],
      tool_choice: { type: 'tool', name: 'submit_evaluation' },
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
        console.log('[vectorlint] Prompt (full):');
        console.log(prompt);
        console.log('[vectorlint] Injected content (full):');
        console.log(content);
      } else if (this.config.showPromptTrunc) {
        console.log('[vectorlint] Prompt (first 500 chars):');
        console.log(prompt.slice(0, 500));
        if (prompt.length > 500) console.log('... [truncated]');
        const preview = content.slice(0, 500);
        console.log('[vectorlint] Injected content preview (first 500 chars):');
        console.log(preview);
        if (content.length > 500) console.log('... [truncated]');
      }
    }

    let response: Anthropic.Messages.Message;
    try {
      response = await this.client.messages.create(params) as Anthropic.Messages.Message;
    } catch (e: unknown) {
      const err = handleUnknownError(e, 'Anthropic API call');
      throw new Error(`Anthropic API call failed: ${err.message}`);
    }

    // Extract structured result from tool use
    const toolUse = response.content.find(
      (c): c is Anthropic.Messages.ToolUseBlock => c.type === 'tool_use'
    );

    if (!toolUse || toolUse.name !== 'submit_evaluation') {
      throw new Error('No tool call received from Anthropic API');
    }

    if (this.config.debug) {
      const usage = response.usage;
      const stopReason = response.stop_reason;
      if (usage || stopReason) {
        console.log('[vectorlint] LLM response meta:', { usage, stop_reason: stopReason });
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

    return toolUse.input as T;
  }
}