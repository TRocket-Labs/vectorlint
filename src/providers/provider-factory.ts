import { createOpenAI } from '@ai-sdk/openai';
import { createAzure } from '@ai-sdk/azure';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import type { LanguageModel } from 'ai';
import { LLMProvider } from './llm-provider';
import { VercelAIProvider, type VercelAIConfig } from './vercel-ai-provider';
import { RequestBuilder } from './request-builder';
import type { EnvConfig } from '../schemas/env-schemas';
import type { Logger } from '../logging/logger';
import type { AIObservability } from '../observability/ai-observability';

export interface ProviderOptions {
  debug?: boolean;
  showPrompt?: boolean;
  showPromptTrunc?: boolean;
  logger?: Logger;
  observability?: AIObservability;
}

export enum ProviderType {
  AzureOpenAI = 'azure-openai',
  Anthropic = 'anthropic',
  OpenAI = 'openai',
  Gemini = 'gemini',
  AmazonBedrock = 'amazon-bedrock',
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
  let modelName: string;
  let temperature = 0.2;

  switch (envConfig.LLM_PROVIDER) {
    case ProviderType.AzureOpenAI: {
      const azure = createAzure({
        apiKey: envConfig.AZURE_OPENAI_API_KEY,
        baseURL: envConfig.AZURE_OPENAI_ENDPOINT,
        apiVersion: envConfig.AZURE_OPENAI_API_VERSION ?? '2024-02-15-preview',
      });
      // Cast required: @ai-sdk/azure's factory returns a provider-specific type
      // that is not directly assignable to the generic LanguageModel from 'ai'.
      // Tested with @ai-sdk/azure@1.x — revisit if the SDK adds a typed adapter.
      model = azure(envConfig.AZURE_OPENAI_DEPLOYMENT_NAME) as unknown as LanguageModel;
      modelName = envConfig.AZURE_OPENAI_DEPLOYMENT_NAME;
      temperature = envConfig.AZURE_OPENAI_TEMPERATURE ?? 0.2;
      break;
    }

    case ProviderType.Anthropic: {
      const anthropic = createAnthropic({
        apiKey: envConfig.ANTHROPIC_API_KEY,
      });
      model = anthropic(envConfig.ANTHROPIC_MODEL);
      modelName = envConfig.ANTHROPIC_MODEL;
      temperature = envConfig.ANTHROPIC_TEMPERATURE ?? 0.2;
      break;
    }

    case ProviderType.OpenAI: {
      const openai = createOpenAI({
        apiKey: envConfig.OPENAI_API_KEY,
      });
      model = openai(envConfig.OPENAI_MODEL);
      modelName = envConfig.OPENAI_MODEL;
      temperature = envConfig.OPENAI_TEMPERATURE ?? 0.2;
      break;
    }

    case ProviderType.Gemini: {
      const google = createGoogleGenerativeAI({
        apiKey: envConfig.GEMINI_API_KEY,
      });
      model = google(envConfig.GEMINI_MODEL);
      modelName = envConfig.GEMINI_MODEL;
      temperature = envConfig.GEMINI_TEMPERATURE ?? 0.2;
      break;
    }

    case ProviderType.AmazonBedrock: {
      const bedrock = createAmazonBedrock({
        region: envConfig.AWS_REGION,
        ...(envConfig.AWS_ACCESS_KEY_ID && { accessKeyId: envConfig.AWS_ACCESS_KEY_ID }),
        ...(envConfig.AWS_SECRET_ACCESS_KEY && { secretAccessKey: envConfig.AWS_SECRET_ACCESS_KEY }),
      });
      model = bedrock(envConfig.BEDROCK_MODEL) as unknown as LanguageModel;
      modelName = envConfig.BEDROCK_MODEL;
      temperature = envConfig.BEDROCK_TEMPERATURE ?? 0.2;
      break;
    }

    default:
      // TypeScript should prevent this, but add runtime safety
      throw new Error(`Unsupported provider type: ${(envConfig as { LLM_PROVIDER: string }).LLM_PROVIDER}`);
  }

  const config: VercelAIConfig = {
    model,
    providerName: envConfig.LLM_PROVIDER,
    modelName,
    temperature,
    ...(envConfig.LLM_PROVIDER === ProviderType.Anthropic && envConfig.ANTHROPIC_MAX_TOKENS !== undefined && { maxTokens: envConfig.ANTHROPIC_MAX_TOKENS }),
    ...(options.debug !== undefined && { debug: options.debug }),
    ...(options.showPrompt !== undefined && { showPrompt: options.showPrompt }),
    ...(options.showPromptTrunc !== undefined && { showPromptTrunc: options.showPromptTrunc }),
    ...(options.logger ? { logger: options.logger } : {}),
    ...(options.observability ? { observability: options.observability } : {}),
  };

  return new VercelAIProvider(config, builder);
}
