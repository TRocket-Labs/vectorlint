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

export interface ProviderOptions {
  debug?: boolean;
  showPrompt?: boolean;
  showPromptTrunc?: boolean;
  logger?: Logger;
}

export enum ProviderType {
  AzureOpenAI = 'azure-openai',
  Anthropic = 'anthropic',
  OpenAI = 'openai',
  Gemini = 'gemini',
  AmazonBedrock = 'amazon-bedrock',
}

function resolveDefaultModelIdentifier(envConfig: EnvConfig): string {
  switch (envConfig.LLM_PROVIDER) {
    case ProviderType.AzureOpenAI:
      return envConfig.AZURE_OPENAI_DEPLOYMENT_NAME;
    case ProviderType.Anthropic:
      return envConfig.ANTHROPIC_MODEL;
    case ProviderType.OpenAI:
      return envConfig.OPENAI_MODEL;
    case ProviderType.Gemini:
      return envConfig.GEMINI_MODEL;
    case ProviderType.AmazonBedrock:
      return envConfig.BEDROCK_MODEL;
    default:
      throw new Error(`Unsupported provider type: ${(envConfig as { LLM_PROVIDER: string }).LLM_PROVIDER}`);
  }
}

function resolveProviderConfig(
  envConfig: EnvConfig,
  modelIdentifier: string,
): Pick<VercelAIConfig, 'model' | 'temperature' | 'maxTokens'> {
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
      const model = azure(modelIdentifier) as unknown as LanguageModel;
      return {
        model,
        temperature: envConfig.AZURE_OPENAI_TEMPERATURE ?? 0.2,
      };
    }

    case ProviderType.Anthropic: {
      const anthropic = createAnthropic({
        apiKey: envConfig.ANTHROPIC_API_KEY,
      });
      return {
        model: anthropic(modelIdentifier),
        temperature: envConfig.ANTHROPIC_TEMPERATURE ?? 0.2,
        maxTokens: envConfig.ANTHROPIC_MAX_TOKENS,
      };
    }

    case ProviderType.OpenAI: {
      const openai = createOpenAI({
        apiKey: envConfig.OPENAI_API_KEY,
      });
      return {
        model: openai(modelIdentifier),
        temperature: envConfig.OPENAI_TEMPERATURE ?? 0.2,
      };
    }

    case ProviderType.Gemini: {
      const google = createGoogleGenerativeAI({
        apiKey: envConfig.GEMINI_API_KEY,
      });
      return {
        model: google(modelIdentifier),
        temperature: envConfig.GEMINI_TEMPERATURE ?? 0.2,
      };
    }

    case ProviderType.AmazonBedrock: {
      const bedrock = createAmazonBedrock({
        region: envConfig.AWS_REGION,
        ...(envConfig.AWS_ACCESS_KEY_ID && { accessKeyId: envConfig.AWS_ACCESS_KEY_ID }),
        ...(envConfig.AWS_SECRET_ACCESS_KEY && { secretAccessKey: envConfig.AWS_SECRET_ACCESS_KEY }),
      });
      return {
        model: bedrock(modelIdentifier) as unknown as LanguageModel,
        temperature: envConfig.BEDROCK_TEMPERATURE ?? 0.2,
      };
    }

    default:
      throw new Error(`Unsupported provider type: ${(envConfig as { LLM_PROVIDER: string }).LLM_PROVIDER}`);
  }
}

export function createProviderForModel(
  envConfig: EnvConfig,
  modelIdentifier: string,
  options: ProviderOptions = {},
  builder?: RequestBuilder
): LLMProvider {
  const providerConfig = resolveProviderConfig(envConfig, modelIdentifier);

  const config: VercelAIConfig = {
    ...providerConfig,
    ...(options.debug !== undefined && { debug: options.debug }),
    ...(options.showPrompt !== undefined && { showPrompt: options.showPrompt }),
    ...(options.showPromptTrunc !== undefined && { showPromptTrunc: options.showPromptTrunc }),
    ...(options.logger ? { logger: options.logger } : {}),
  };

  return new VercelAIProvider(config, builder);
}

export function getDefaultProviderModelIdentifier(envConfig: EnvConfig): string {
  return resolveDefaultModelIdentifier(envConfig);
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
  return createProviderForModel(
    envConfig,
    resolveDefaultModelIdentifier(envConfig),
    options,
    builder
  );
}
