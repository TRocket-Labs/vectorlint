import { describe, it, expect, vi } from 'vitest';
import { createProvider, ProviderType } from '../src/providers/provider-factory';
import { VercelAIProvider } from '../src/providers/vercel-ai-provider';
import { DefaultRequestBuilder } from '../src/providers/request-builder';
import { ConfigError } from '../src/errors';
import type { EnvConfig } from '../src/schemas/env-schemas';
import { createCapabilityProviderBundle } from '../src/providers/capability-provider-bundle';
import { MODEL_CAPABILITY_TIERS, resolveConfiguredModelForCapability } from '../src/providers/model-capability';

// Mock the Vercel AI SDK provider creators
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn((model: string) => ({ _type: 'openai', model }))),
}));

vi.mock('@ai-sdk/azure', () => ({
  createAzure: vi.fn(() => vi.fn((model: string) => ({ _type: 'azure', model }))),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => vi.fn((model: string) => ({ _type: 'anthropic', model }))),
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn((model: string) => ({ _type: 'google', model }))),
}));

vi.mock('@ai-sdk/amazon-bedrock', () => ({
  createAmazonBedrock: vi.fn(() => vi.fn((model: string) => ({ _type: 'bedrock', model }))),
}));

function getProviderModelName(provider: unknown): string | undefined {
  const candidate = provider as { config?: { model?: { model?: string } } };
  return candidate.config?.model?.model;
}

describe('Provider Factory', () => {
  describe('Provider Instantiation', () => {
    it('creates VercelAIProvider for Azure OpenAI when configured', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.AzureOpenAI,
        AZURE_OPENAI_API_KEY: 'test-key',
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'test-deployment',
        AZURE_OPENAI_API_VERSION: '2024-02-15-preview',
      };

      const provider = createProvider(envConfig, { debug: true });
      expect(provider).toBeInstanceOf(VercelAIProvider);
    });

    it('creates VercelAIProvider for Anthropic when configured', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.Anthropic,
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        ANTHROPIC_MODEL: 'claude-3-sonnet-20240229',
        ANTHROPIC_MAX_TOKENS: 4096,
      };

      const provider = createProvider(envConfig, { debug: true });
      expect(provider).toBeInstanceOf(VercelAIProvider);
    });

    it('creates VercelAIProvider for OpenAI when configured', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.OpenAI,
        OPENAI_API_KEY: 'sk-test-key',
        OPENAI_MODEL: 'gpt-4o',
        OPENAI_TEMPERATURE: 0.2,
      };

      const provider = createProvider(envConfig, { debug: true });
      expect(provider).toBeInstanceOf(VercelAIProvider);
    });

    it('creates VercelAIProvider for Gemini when configured', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.Gemini,
        GEMINI_API_KEY: 'test-key',
        GEMINI_MODEL: 'gemini-2.5-flash',
      };

      const provider = createProvider(envConfig);
      expect(provider).toBeInstanceOf(VercelAIProvider);
    });

    it('creates VercelAIProvider for Amazon Bedrock when configured', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.AmazonBedrock,
        AWS_REGION: 'us-west-2',
        AWS_ACCESS_KEY_ID: 'test-key',
        AWS_SECRET_ACCESS_KEY: 'test-secret',
        BEDROCK_MODEL: 'global.anthropic.claude-sonnet-4-5-20250929-v1:0',
      };

      const provider = createProvider(envConfig);
      expect(provider).toBeInstanceOf(VercelAIProvider);
    });
  });

  describe('Configuration Mapping', () => {
    it('passes Azure OpenAI configuration correctly', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.AzureOpenAI,
        AZURE_OPENAI_API_KEY: 'test-api-key',
        AZURE_OPENAI_ENDPOINT: 'https://custom.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'custom-deployment',
        AZURE_OPENAI_API_VERSION: '2023-12-01-preview',
        AZURE_OPENAI_TEMPERATURE: 0.8,
      };

      expect(() => createProvider(envConfig)).not.toThrow();
    });

    it('passes Anthropic configuration correctly', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.Anthropic,
        ANTHROPIC_API_KEY: 'sk-ant-custom-key',
        ANTHROPIC_MODEL: 'claude-3-haiku-20240307',
        ANTHROPIC_MAX_TOKENS: 2048,
        ANTHROPIC_TEMPERATURE: 0.5,
      };

      expect(() => createProvider(envConfig)).not.toThrow();
    });

    it('passes OpenAI configuration correctly', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.OpenAI,
        OPENAI_API_KEY: 'sk-custom-key',
        OPENAI_MODEL: 'gpt-4o-mini',
        OPENAI_TEMPERATURE: 0.8,
      };

      expect(() => createProvider(envConfig)).not.toThrow();
    });

    it('passes Bedrock configuration correctly', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.AmazonBedrock,
        AWS_REGION: 'eu-central-1',
        BEDROCK_MODEL: 'meta.llama3-70b-instruct-v1:0',
        BEDROCK_TEMPERATURE: 0.5,
      };

      expect(() => createProvider(envConfig)).not.toThrow();
    });

    it('passes debug options to provider', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.OpenAI,
        OPENAI_API_KEY: 'sk-test-key',
        OPENAI_MODEL: 'gpt-4o',
      };

      const options = {
        debug: true,
        showPrompt: true,
        showPromptTrunc: false,
      };

      expect(() => createProvider(envConfig, options)).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('throws error for unsupported provider type', () => {
      const envConfig = {
        LLM_PROVIDER: 'unsupported-provider',
      } as unknown as EnvConfig;

      expect(() => createProvider(envConfig)).toThrow('Unsupported provider type: unsupported-provider');
    });

    it('throws descriptive error for invalid provider type', () => {
      const envConfig = {
        LLM_PROVIDER: 'unsupported-provider',
      } as unknown as EnvConfig;

      expect(() => createProvider(envConfig)).toThrow('Unsupported provider type: unsupported-provider');
    });

    it('handles missing provider type gracefully', () => {
      const envConfig = {} as unknown as EnvConfig;

      expect(() => createProvider(envConfig)).toThrow('Unsupported provider type: undefined');
    });

    it('handles null provider type gracefully', () => {
      const envConfig = {
        LLM_PROVIDER: null,
      } as unknown as EnvConfig;

      expect(() => createProvider(envConfig)).toThrow('Unsupported provider type: null');
    });
  });

  describe('Interface Consistency', () => {
    it('maintains consistent LLMProvider interface for all providers', () => {
      const azureConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.AzureOpenAI,
        AZURE_OPENAI_API_KEY: 'test-key',
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'test-deployment',
        AZURE_OPENAI_API_VERSION: '2024-02-15-preview',
      };

      const anthropicConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.Anthropic,
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        ANTHROPIC_MODEL: 'claude-3-sonnet-20240229',
        ANTHROPIC_MAX_TOKENS: 4096,
      };

      const openaiConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.OpenAI,
        OPENAI_API_KEY: 'sk-test-key',
        OPENAI_MODEL: 'gpt-4o',
      };

      const geminiConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.Gemini,
        GEMINI_API_KEY: 'test-key',
        GEMINI_MODEL: 'gemini-2.5-flash',
      };

      const bedrockConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.AmazonBedrock,
        AWS_REGION: 'us-east-1',
        BEDROCK_MODEL: 'amazon.titan-text-express-v1',
      };

      const azureProvider = createProvider(azureConfig);
      const anthropicProvider = createProvider(anthropicConfig);
      const openaiProvider = createProvider(openaiConfig);
      const geminiProvider = createProvider(geminiConfig);
      const bedrockProvider = createProvider(bedrockConfig);

      // All should implement the LLMProvider interface
      for (const provider of [azureProvider, anthropicProvider, openaiProvider, geminiProvider, bedrockProvider]) {
        expect(provider).toHaveProperty('runPromptStructured');
        expect(typeof provider.runPromptStructured).toBe('function');
      }
    });
  });

  describe('Options Handling', () => {
    it('works without options parameter', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.OpenAI,
        OPENAI_API_KEY: 'sk-test-key',
        OPENAI_MODEL: 'gpt-4o',
      };

      expect(() => createProvider(envConfig)).not.toThrow();
    });

    it('works with empty options object', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.Anthropic,
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        ANTHROPIC_MODEL: 'claude-3-sonnet-20240229',
        ANTHROPIC_MAX_TOKENS: 4096,
      };

      expect(() => createProvider(envConfig, {})).not.toThrow();
    });

    it('works with partial options', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.AzureOpenAI,
        AZURE_OPENAI_API_KEY: 'test-key',
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'test-deployment',
        AZURE_OPENAI_API_VERSION: '2024-02-15-preview',
      };

      expect(() => createProvider(envConfig, { debug: true })).not.toThrow();
      expect(() => createProvider(envConfig, { showPrompt: true })).not.toThrow();
    });

    it('handles all debug options for all providers', () => {
      const azureConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.AzureOpenAI,
        AZURE_OPENAI_API_KEY: 'test-key',
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'test-deployment',
        AZURE_OPENAI_API_VERSION: '2024-02-15-preview',
      };

      const anthropicConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.Anthropic,
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        ANTHROPIC_MODEL: 'claude-3-sonnet-20240229',
        ANTHROPIC_MAX_TOKENS: 4096,
      };

      const openaiConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.OpenAI,
        OPENAI_API_KEY: 'sk-test-key',
        OPENAI_MODEL: 'gpt-4o',
      };

      const geminiConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.Gemini,
        GEMINI_API_KEY: 'test-key',
        GEMINI_MODEL: 'gemini-2.5-flash',
      };

      const bedrockConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.AmazonBedrock,
        AWS_REGION: 'us-east-1',
        BEDROCK_MODEL: 'amazon.titan-text-express-v1',
      };

      const allOptions = {
        debug: true,
        showPrompt: true,
        showPromptTrunc: true,
      };

      expect(() => createProvider(azureConfig, allOptions)).not.toThrow();
      expect(() => createProvider(anthropicConfig, allOptions)).not.toThrow();
      expect(() => createProvider(openaiConfig, allOptions)).not.toThrow();
      expect(() => createProvider(geminiConfig, allOptions)).not.toThrow();
      expect(() => createProvider(bedrockConfig, allOptions)).not.toThrow();
    });
  });

  describe('Custom Request Builder', () => {
    it('passes custom request builder to provider', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.OpenAI,
        OPENAI_API_KEY: 'sk-test-key',
        OPENAI_MODEL: 'gpt-4o',
      };

      const customBuilder = new DefaultRequestBuilder('Custom directive');
      const provider = createProvider(envConfig, {}, customBuilder);
      expect(provider).toBeInstanceOf(VercelAIProvider);
    });
  });

  describe('Provider-Specific Configuration', () => {
    it('handles Azure OpenAI specific fields correctly', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.AzureOpenAI,
        AZURE_OPENAI_API_KEY: 'test-key',
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'test-deployment',
        AZURE_OPENAI_API_VERSION: '2024-02-15-preview',
        AZURE_OPENAI_TEMPERATURE: 1.5,
      };

      expect(() => createProvider(envConfig)).not.toThrow();
    });

    it('handles Anthropic specific fields correctly', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.Anthropic,
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        ANTHROPIC_MODEL: 'claude-3-opus-20240229',
        ANTHROPIC_MAX_TOKENS: 8192,
        ANTHROPIC_TEMPERATURE: 0.9,
      };

      expect(() => createProvider(envConfig)).not.toThrow();
    });

    it('handles OpenAI specific fields correctly', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.OpenAI,
        OPENAI_API_KEY: 'sk-test-key',
        OPENAI_MODEL: 'gpt-4-turbo',
        OPENAI_TEMPERATURE: 1.5,
      };

      expect(() => createProvider(envConfig)).not.toThrow();
    });

    it('handles Gemini specific fields correctly', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.Gemini,
        GEMINI_API_KEY: 'test-key',
        GEMINI_MODEL: 'gemini-pro',
        GEMINI_TEMPERATURE: 0.5,
      };

      expect(() => createProvider(envConfig)).not.toThrow();
    });

    it('handles Bedrock specific fields correctly', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.AmazonBedrock,
        AWS_REGION: 'us-east-1',
        AWS_ACCESS_KEY_ID: 'test-key',
        AWS_SECRET_ACCESS_KEY: 'test-secret',
        BEDROCK_MODEL: 'anthropic.claude-3-opus-20240229-v1:0',
        BEDROCK_TEMPERATURE: 0.8,
      };

      expect(() => createProvider(envConfig)).not.toThrow();
    });
  });

  describe('Capability Tier Resolver', () => {
    it('exposes the expected tier order', () => {
      expect(MODEL_CAPABILITY_TIERS).toEqual(['high-capability', 'mid-capability', 'low-capability']);
    });

    it('resolves OpenAI capability tiers with upward-only fallback', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.OpenAI,
        OPENAI_API_KEY: 'sk-test-key',
        OPENAI_MODEL: 'gpt-4o',
        OPENAI_LOW_CAPABILITY_MODEL: 'gpt-4o-mini',
        OPENAI_MID_CAPABILITY_MODEL: 'gpt-4o',
        OPENAI_HIGH_CAPABILITY_MODEL: 'gpt-4.1',
      };

      expect(resolveConfiguredModelForCapability(envConfig, 'low-capability')).toBe('gpt-4o-mini');
      expect(resolveConfiguredModelForCapability(envConfig, 'mid-capability')).toBe('gpt-4o');
      expect(resolveConfiguredModelForCapability(envConfig, 'high-capability')).toBe('gpt-4.1');
    });

    it('resolves Anthropic capability tiers with upward-only fallback', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.Anthropic,
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        ANTHROPIC_MODEL: 'claude-3-sonnet-20240229',
        ANTHROPIC_LOW_CAPABILITY_MODEL: 'claude-3-haiku-20240307',
        ANTHROPIC_MID_CAPABILITY_MODEL: 'claude-3-5-sonnet-20241022',
        ANTHROPIC_HIGH_CAPABILITY_MODEL: 'claude-opus-4-20250514',
      };

      expect(resolveConfiguredModelForCapability(envConfig, 'low-capability')).toBe('claude-3-haiku-20240307');
      expect(resolveConfiguredModelForCapability(envConfig, 'mid-capability')).toBe('claude-3-5-sonnet-20241022');
      expect(resolveConfiguredModelForCapability(envConfig, 'high-capability')).toBe('claude-opus-4-20250514');
    });

    it('resolves Gemini capability tiers with upward-only fallback', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.Gemini,
        GEMINI_API_KEY: 'gemini-key',
        GEMINI_MODEL: 'gemini-2.5-flash',
        GEMINI_LOW_CAPABILITY_MODEL: 'gemini-2.0-flash',
        GEMINI_MID_CAPABILITY_MODEL: 'gemini-2.5-flash',
        GEMINI_HIGH_CAPABILITY_MODEL: 'gemini-2.5-pro',
      };

      expect(resolveConfiguredModelForCapability(envConfig, 'low-capability')).toBe('gemini-2.0-flash');
      expect(resolveConfiguredModelForCapability(envConfig, 'mid-capability')).toBe('gemini-2.5-flash');
      expect(resolveConfiguredModelForCapability(envConfig, 'high-capability')).toBe('gemini-2.5-pro');
    });

    it('resolves Bedrock capability tiers with upward-only fallback', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.AmazonBedrock,
        AWS_REGION: 'us-east-1',
        BEDROCK_MODEL: 'global.anthropic.claude-sonnet-4-5-20250929-v1:0',
        BEDROCK_LOW_CAPABILITY_MODEL: 'anthropic.claude-3-haiku-20240307-v1:0',
        BEDROCK_MID_CAPABILITY_MODEL: 'anthropic.claude-3-sonnet-20240229-v1:0',
        BEDROCK_HIGH_CAPABILITY_MODEL: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
      };

      expect(resolveConfiguredModelForCapability(envConfig, 'low-capability')).toBe('anthropic.claude-3-haiku-20240307-v1:0');
      expect(resolveConfiguredModelForCapability(envConfig, 'mid-capability')).toBe('anthropic.claude-3-sonnet-20240229-v1:0');
      expect(resolveConfiguredModelForCapability(envConfig, 'high-capability')).toBe('anthropic.claude-3-5-sonnet-20240620-v1:0');
    });

    it('resolves Azure deployment names with upward-only fallback', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.AzureOpenAI,
        AZURE_OPENAI_API_KEY: 'test-key',
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'default-deployment',
        AZURE_OPENAI_LOW_CAPABILITY_DEPLOYMENT_NAME: 'low-deployment',
        AZURE_OPENAI_MID_CAPABILITY_DEPLOYMENT_NAME: 'mid-deployment',
        AZURE_OPENAI_HIGH_CAPABILITY_DEPLOYMENT_NAME: 'high-deployment',
      };

      expect(resolveConfiguredModelForCapability(envConfig, 'low-capability')).toBe('low-deployment');
      expect(resolveConfiguredModelForCapability(envConfig, 'mid-capability')).toBe('mid-deployment');
      expect(resolveConfiguredModelForCapability(envConfig, 'high-capability')).toBe('high-deployment');
    });

    it('falls back to the provider default when capability tiers are absent', () => {
      const openaiEnv: EnvConfig = {
        LLM_PROVIDER: ProviderType.OpenAI,
        OPENAI_API_KEY: 'sk-test-key',
        OPENAI_MODEL: 'gpt-4o',
      };
      const azureEnv: EnvConfig = {
        LLM_PROVIDER: ProviderType.AzureOpenAI,
        AZURE_OPENAI_API_KEY: 'test-key',
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'default-deployment',
      };

      expect(resolveConfiguredModelForCapability(openaiEnv, 'low-capability')).toBe('gpt-4o');
      expect(resolveConfiguredModelForCapability(openaiEnv, 'mid-capability')).toBe('gpt-4o');
      expect(resolveConfiguredModelForCapability(openaiEnv, 'high-capability')).toBe('gpt-4o');
      expect(resolveConfiguredModelForCapability(azureEnv, 'low-capability')).toBe('default-deployment');
      expect(resolveConfiguredModelForCapability(azureEnv, 'mid-capability')).toBe('default-deployment');
      expect(resolveConfiguredModelForCapability(azureEnv, 'high-capability')).toBe('default-deployment');
    });

    it('throws when all configured identifiers are blank after trimming', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.OpenAI,
        OPENAI_API_KEY: 'sk-test-key',
        OPENAI_MODEL: '   ',
        OPENAI_LOW_CAPABILITY_MODEL: '  ',
        OPENAI_MID_CAPABILITY_MODEL: '\t',
        OPENAI_HIGH_CAPABILITY_MODEL: '\n',
      };

      expect(() => resolveConfiguredModelForCapability(envConfig, 'low-capability')).toThrow(
        new ConfigError('No configured model or deployment name found for requested capability tier: low-capability')
      );
    });
  });

  describe('Capability Provider Bundle', () => {
    it('resolves high, mid, and low capability providers to the configured models', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.OpenAI,
        OPENAI_API_KEY: 'sk-test-key',
        OPENAI_MODEL: 'gpt-4o',
        OPENAI_LOW_CAPABILITY_MODEL: 'gpt-4o-mini',
        OPENAI_MID_CAPABILITY_MODEL: 'gpt-4o',
        OPENAI_HIGH_CAPABILITY_MODEL: 'gpt-4.1',
      };

      const bundle = createCapabilityProviderBundle(envConfig);

      expect(getProviderModelName(bundle.defaultProvider)).toBe('gpt-4o');
      expect(getProviderModelName(bundle.resolveCapabilityProvider('low-capability'))).toBe('gpt-4o-mini');
      expect(getProviderModelName(bundle.resolveCapabilityProvider('mid-capability'))).toBe('gpt-4o');
      expect(getProviderModelName(bundle.resolveCapabilityProvider('high-capability'))).toBe('gpt-4.1');
      expect(bundle.resolveCapabilityProvider('mid-capability')).toBe(bundle.defaultProvider);
      expect(getProviderModelName(bundle.orchestratorProvider)).toBe('gpt-4.1');
      expect(getProviderModelName(bundle.lintProvider)).toBe('gpt-4o');
      expect(bundle.lintProvider).toBe(bundle.defaultProvider);
    });

    it('applies upward-only fallback when a requested tier is not configured', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.OpenAI,
        OPENAI_API_KEY: 'sk-test-key',
        OPENAI_MODEL: 'gpt-4o',
        OPENAI_MID_CAPABILITY_MODEL: 'gpt-4.1-mini',
      };

      const bundle = createCapabilityProviderBundle(envConfig);

      expect(getProviderModelName(bundle.resolveCapabilityProvider('low-capability'))).toBe('gpt-4.1-mini');
      expect(getProviderModelName(bundle.resolveCapabilityProvider('mid-capability'))).toBe('gpt-4.1-mini');
      expect(getProviderModelName(bundle.resolveCapabilityProvider('high-capability'))).toBe('gpt-4o');
    });

    it('reuses the default provider model for agent mode when no capability tiers are configured', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.OpenAI,
        OPENAI_API_KEY: 'sk-test-key',
        OPENAI_MODEL: 'gpt-4o',
      };

      const bundle = createCapabilityProviderBundle(envConfig);

      expect(bundle.orchestratorProvider).toBe(bundle.defaultProvider);
      expect(bundle.lintProvider).toBe(bundle.defaultProvider);
      expect(bundle.resolveCapabilityProvider('low-capability')).toBe(bundle.defaultProvider);
      expect(bundle.resolveCapabilityProvider('mid-capability')).toBe(bundle.defaultProvider);
      expect(bundle.resolveCapabilityProvider('high-capability')).toBe(bundle.defaultProvider);
    });
  });
});
