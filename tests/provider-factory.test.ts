import { describe, it, expect, vi } from 'vitest';
import { createProvider, ProviderType } from '../src/providers/provider-factory';
import { VercelAIProvider } from '../src/providers/vercel-ai-provider';
import { DefaultRequestBuilder } from '../src/providers/request-builder';
import type { EnvConfig } from '../src/schemas/env-schemas';
import type { AIObservability } from '../src/observability/ai-observability';

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

  describe('Observability Wiring', () => {
    it('passes observability through to VercelAIProvider', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.OpenAI,
        OPENAI_API_KEY: 'sk-test-key',
        OPENAI_MODEL: 'gpt-4o',
      };
      const observability: AIObservability = {
        init: vi.fn(),
        decorateCall: vi.fn(() => ({})),
        shutdown: vi.fn(),
      };

      const provider = createProvider(envConfig, { observability }) as unknown as {
        config?: { observability?: AIObservability };
      };

      expect(provider.config?.observability).toBe(observability);
    });

    it('passes explicit provider and model names to VercelAIProvider config', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: ProviderType.OpenAI,
        OPENAI_API_KEY: 'sk-test-key',
        OPENAI_MODEL: 'gpt-4o',
      };

      const provider = createProvider(envConfig) as unknown as {
        config?: { providerName?: string; modelName?: string };
      };

      expect(provider.config?.providerName).toBe(ProviderType.OpenAI);
      expect(provider.config?.modelName).toBe('gpt-4o');
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
});
