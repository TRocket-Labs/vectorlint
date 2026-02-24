import { createOpenAI } from '@ai-sdk/openai';
import { createAzure } from '@ai-sdk/azure';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import { LLMProvider } from './llm-provider';
import { VercelAIProvider, type VercelAIConfig } from './vercel-ai-provider';
import { RequestBuilder } from './request-builder';
import type { EnvConfig } from '../schemas/env-schemas';

export interface ProviderOptions {
  debug?: boolean;
  showPrompt?: boolean;
  showPromptTrunc?: boolean;
}

export enum ProviderType {
  AzureOpenAI = 'azure-openai',
  Anthropic = 'anthropic',
  OpenAI = 'openai',
  Gemini = 'gemini',
}

/**
 * Creates the appropriate LLM provider based on environment configuration
 * @param envConfig - Validated environment configuration
 * @param options - Debug and display options
 * @param builder - Optional request builder (for dependency injection)
 * @returns Configured LLM provider instance
 */
export function createProvider(
  envConfig: EnvConfig,
  options: ProviderOptions = {},
  builder?: RequestBuilder
): LLMProvider {
  let model: LanguageModel;
  let temperature = 0.2;

  switch (envConfig.LLM_PROVIDER) {
    case ProviderType.AzureOpenAI: {
      const azure = createAzure({
        apiKey: envConfig.AZURE_OPENAI_API_KEY,
        baseURL: envConfig.AZURE_OPENAI_ENDPOINT,
        apiVersion: envConfig.AZURE_OPENAI_API_VERSION ?? '2024-02-15-preview',
      });
      model = azure(envConfig.AZURE_OPENAI_DEPLOYMENT_NAME);
      temperature = envConfig.AZURE_OPENAI_TEMPERATURE ?? 0.2;
      break;
    }

    case ProviderType.Anthropic: {
      const anthropic = createAnthropic({
        apiKey: envConfig.ANTHROPIC_API_KEY,
      });
      model = anthropic(envConfig.ANTHROPIC_MODEL ?? 'claude-3-sonnet-20240229');
      temperature = envConfig.ANTHROPIC_TEMPERATURE ?? 0.2;
      break;
    }

    case ProviderType.OpenAI: {
      const openai = createOpenAI({
        apiKey: envConfig.OPENAI_API_KEY,
      });
      model = openai(envConfig.OPENAI_MODEL ?? 'gpt-4o');
      temperature = envConfig.OPENAI_TEMPERATURE ?? 0.2;
      break;
    }

    case ProviderType.Gemini: {
      const google = createGoogleGenerativeAI({
        apiKey: envConfig.GEMINI_API_KEY,
      });
      model = google(envConfig.GEMINI_MODEL ?? 'gemini-2.5-flash');
      temperature = envConfig.GEMINI_TEMPERATURE ?? 0.2;
      break;
    }

    default:
      // TypeScript should prevent this, but add runtime safety
      throw new Error(`Unsupported provider type: ${(envConfig as { LLM_PROVIDER: string }).LLM_PROVIDER}`);
  }

  const config: VercelAIConfig = {
    model,
    temperature,
    ...(options.debug !== undefined && { debug: options.debug }),
    ...(options.showPrompt !== undefined && { showPrompt: options.showPrompt }),
    ...(options.showPromptTrunc !== undefined && { showPromptTrunc: options.showPromptTrunc }),
  };

  return new VercelAIProvider(config, builder);
}
