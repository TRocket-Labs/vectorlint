import { describe, it, expect } from 'vitest';
import { createProvider } from '../src/providers/provider-factory';
import { AzureOpenAIProvider } from '../src/providers/azure-openai-provider';
import { AnthropicProvider } from '../src/providers/anthropic-provider';
import type { EnvConfig } from '../src/schemas/env-schemas';

describe('Provider Factory', () => {
  it('creates Azure OpenAI provider when configured', () => {
    const envConfig: EnvConfig = {
      LLM_PROVIDER: 'azure-openai',
      AZURE_OPENAI_API_KEY: 'test-key',
      AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
      AZURE_OPENAI_DEPLOYMENT_NAME: 'test-deployment',
      AZURE_OPENAI_API_VERSION: '2024-02-15-preview',
    };

    const provider = createProvider(envConfig, { debug: true });
    expect(provider).toBeInstanceOf(AzureOpenAIProvider);
  });

  it('creates Anthropic provider when configured', () => {
    const envConfig: EnvConfig = {
      LLM_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'test-key',
      ANTHROPIC_MODEL: 'claude-3-sonnet-20240229',
      ANTHROPIC_MAX_TOKENS: 4096,
    };

    const provider = createProvider(envConfig, { debug: true });
    expect(provider).toBeInstanceOf(AnthropicProvider);
  });

  it('passes options correctly to providers', () => {
    const envConfig: EnvConfig = {
      LLM_PROVIDER: 'azure-openai',
      AZURE_OPENAI_API_KEY: 'test-key',
      AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
      AZURE_OPENAI_DEPLOYMENT_NAME: 'test-deployment',
    };

    const options = {
      debug: true,
      showPrompt: true,
      showPromptTrunc: false,
      debugJson: true,
    };

    // Should not throw - provider creation should work with options
    expect(() => createProvider(envConfig, options)).not.toThrow();
  });

  it('throws error for unsupported provider type', () => {
    const envConfig = {
      LLM_PROVIDER: 'unsupported-provider',
    } as unknown as EnvConfig;

    expect(() => createProvider(envConfig)).toThrow('Unsupported provider type: unsupported-provider');
  });
});