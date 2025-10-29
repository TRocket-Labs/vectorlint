import { LLMProvider } from './llm-provider';
import { AzureOpenAIProvider, type AzureOpenAIConfig } from './azure-openai-provider';
import { AnthropicProvider, type AnthropicConfig } from './anthropic-provider';
import { RequestBuilder } from './request-builder';
import type { EnvConfig } from '../schemas/env-schemas';

export interface ProviderOptions {
  debug?: boolean;
  showPrompt?: boolean;
  showPromptTrunc?: boolean;
  debugJson?: boolean;
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
  switch (envConfig.LLM_PROVIDER) {
    case 'azure-openai': {
      const azureConfig: AzureOpenAIConfig = {
        apiKey: envConfig.AZURE_OPENAI_API_KEY,
        endpoint: envConfig.AZURE_OPENAI_ENDPOINT,
        deploymentName: envConfig.AZURE_OPENAI_DEPLOYMENT_NAME,
        apiVersion: envConfig.AZURE_OPENAI_API_VERSION,
        ...(envConfig.AZURE_OPENAI_TEMPERATURE !== undefined && { temperature: envConfig.AZURE_OPENAI_TEMPERATURE }),
        ...(options.debug !== undefined && { debug: options.debug }),
        ...(options.showPrompt !== undefined && { showPrompt: options.showPrompt }),
        ...(options.showPromptTrunc !== undefined && { showPromptTrunc: options.showPromptTrunc }),
        ...(options.debugJson !== undefined && { debugJson: options.debugJson }),
      };
      return new AzureOpenAIProvider(azureConfig, builder);
    }

    case 'anthropic': {
      const anthropicConfig: AnthropicConfig = {
        apiKey: envConfig.ANTHROPIC_API_KEY,
        model: envConfig.ANTHROPIC_MODEL,
        maxTokens: envConfig.ANTHROPIC_MAX_TOKENS,
        ...(envConfig.ANTHROPIC_TEMPERATURE !== undefined && { temperature: envConfig.ANTHROPIC_TEMPERATURE }),
        ...(options.debug !== undefined && { debug: options.debug }),
        ...(options.showPrompt !== undefined && { showPrompt: options.showPrompt }),
        ...(options.showPromptTrunc !== undefined && { showPromptTrunc: options.showPromptTrunc }),
        ...(options.debugJson !== undefined && { debugJson: options.debugJson }),
      };
      return new AnthropicProvider(anthropicConfig, builder);
    }

    default:
      // TypeScript should prevent this, but add runtime safety
      throw new Error(`Unsupported provider type: ${(envConfig as { LLM_PROVIDER: string }).LLM_PROVIDER}`);
  }
}