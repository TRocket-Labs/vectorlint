import { AzureOpenAI } from 'openai';
import { LLMProvider } from './llm-provider';
import { DefaultRequestBuilder, RequestBuilder } from './request-builder';
import { validateApiResponse } from '../boundaries/api-client';
import { handleUnknownError } from '../errors/index';

export interface AzureOpenAIConfig {
  apiKey: string;
  endpoint: string;
  deploymentName: string;
  apiVersion?: string | undefined;
  temperature?: number | undefined;
  debug?: boolean | undefined;
  showPrompt?: boolean | undefined; // full prompt and content
  showPromptTrunc?: boolean | undefined; // truncated previews (500 chars)
  debugJson?: boolean | undefined;
}

export const AZURE_OPENAI_DEFAULT_CONFIG = {
  apiVersion: '2024-02-15-preview',
  temperature: 0.2,
};

export class AzureOpenAIProvider implements LLMProvider {
  private client: AzureOpenAI;
  private deploymentName: string;
  private temperature?: number | undefined;
  private apiVersion?: string | undefined;
  private debug?: boolean | undefined;
  private showPrompt?: boolean | undefined;
  private showPromptTrunc?: boolean | undefined;
  private debugJson?: boolean | undefined;
  private builder: RequestBuilder;

  constructor(config: AzureOpenAIConfig, builder?: RequestBuilder) {
    this.client = new AzureOpenAI({
      apiKey: config.apiKey,
      endpoint: config.endpoint,
      apiVersion: config.apiVersion || AZURE_OPENAI_DEFAULT_CONFIG.apiVersion,
    });
    this.deploymentName = config.deploymentName;
    this.temperature = config.temperature;
    this.apiVersion = config.apiVersion;
    this.debug = config.debug;
    this.showPrompt = config.showPrompt;
    this.showPromptTrunc = config.showPromptTrunc;
    this.debugJson = config.debugJson;
    this.builder = builder ?? new DefaultRequestBuilder();
  }

  async runPromptStructured<T = unknown>(content: string, promptText: string, schema: { name: string; schema: Record<string, unknown> }): Promise<T> {
    const prompt = this.builder.buildPromptBodyForStructured(promptText);

    const params: Parameters<typeof this.client.chat.completions.create>[0] = {
      model: this.deploymentName,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: `Input:\n\n${content}` }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: schema,
      },
    };
    if (this.temperature !== undefined) {
      params.temperature = this.temperature;
    }

    if (this.debug) {
      console.log('[vectorlint] Sending request to Azure OpenAI:', {
        model: this.deploymentName,
        apiVersion: this.apiVersion || AZURE_OPENAI_DEFAULT_CONFIG.apiVersion,
        temperature: this.temperature,
      });
      if (this.showPrompt) {
        console.log('[vectorlint] Prompt (full):');
        console.log(prompt);
        console.log('[vectorlint] Injected content (full):');
        console.log(content);
      } else if (this.showPromptTrunc) {
        console.log('[vectorlint] Prompt (first 500 chars):');
        console.log(prompt.slice(0, 500));
        if (prompt.length > 500) console.log('... [truncated]');
        const preview = content.slice(0, 500);
        console.log('[vectorlint] Injected content preview (first 500 chars):');
        console.log(preview);
        if (content.length > 500) console.log('... [truncated]');
      }
    }

    let response;
    try {
      response = await this.client.chat.completions.create(params);
    } catch (e: unknown) {
      const err = handleUnknownError(e, 'OpenAI API call');
      throw new Error(`OpenAI API call failed: ${err.message}`);
    }

    // Type guard to ensure we have a ChatCompletion, not a Stream
    if (!('choices' in response)) {
      throw new Error('Received streaming response when expecting structured response');
    }

    // Validate the API response structure
    let validatedResponse;
    try {
      validatedResponse = validateApiResponse(response);
    } catch (e: unknown) {
      const err = handleUnknownError(e, 'API response validation');
      throw new Error(`Invalid API response structure: ${err.message}`);
    }

    const responseTextRaw = validatedResponse.choices[0]?.message?.content;
    const responseText = (responseTextRaw ?? '').trim();
    if (this.debug) {
      const usage = validatedResponse.usage;
      const finish = validatedResponse.choices[0]?.finish_reason;
      if (usage || finish) {
        console.log('[vectorlint] LLM response meta:', { usage, finish_reason: finish });
      }
      if (this.debugJson) {
        try {
          console.log('[vectorlint] Full JSON response:');
          console.log(JSON.stringify(validatedResponse, null, 2));
        } catch (e: unknown) {
          const err = handleUnknownError(e, 'JSON stringify for debug');
          console.warn(`[vectorlint] Warning: ${err.message}`);
        }
      }
    }
    if (!responseText) {
      throw new Error('Empty response from LLM (no content).');
    }
    try {
      return JSON.parse(responseText) as T;
    } catch (e: unknown) {
      const err = handleUnknownError(e, 'JSON parsing');
      const preview = responseText.slice(0, 200);
      throw new Error(`Failed to parse structured JSON response: ${err.message}. Preview: ${preview}${responseText.length > 200 ? ' ...' : ''}`);
    }
  }
}
