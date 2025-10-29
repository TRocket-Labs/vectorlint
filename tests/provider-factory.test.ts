import { describe, it, expect } from 'vitest';
import { createProvider } from '../src/providers/provider-factory';
import { AzureOpenAIProvider } from '../src/providers/azure-openai-provider';
import { AnthropicProvider } from '../src/providers/anthropic-provider';
import { DefaultRequestBuilder } from '../src/providers/request-builder';
import type { EnvConfig } from '../src/schemas/env-schemas';

describe('Provider Factory', () => {
  describe('Provider Instantiation', () => {
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
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        ANTHROPIC_MODEL: 'claude-3-sonnet-20240229',
        ANTHROPIC_MAX_TOKENS: 4096,
      };

      const provider = createProvider(envConfig, { debug: true });
      expect(provider).toBeInstanceOf(AnthropicProvider);
    });

    it('creates Azure OpenAI provider with minimal configuration', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: 'azure-openai',
        AZURE_OPENAI_API_KEY: 'test-key',
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'test-deployment',
      };

      const provider = createProvider(envConfig);
      expect(provider).toBeInstanceOf(AzureOpenAIProvider);
    });

    it('creates Anthropic provider with minimal configuration', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
      };

      const provider = createProvider(envConfig);
      expect(provider).toBeInstanceOf(AnthropicProvider);
    });

    it('creates provider with custom request builder', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: 'azure-openai',
        AZURE_OPENAI_API_KEY: 'test-key',
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'test-deployment',
      };

      const customBuilder = new DefaultRequestBuilder('Custom directive');
      const provider = createProvider(envConfig, {}, customBuilder);
      expect(provider).toBeInstanceOf(AzureOpenAIProvider);
    });
  });

  describe('Configuration Mapping', () => {
    it('passes Azure OpenAI configuration correctly', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: 'azure-openai',
        AZURE_OPENAI_API_KEY: 'test-api-key',
        AZURE_OPENAI_ENDPOINT: 'https://custom.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'custom-deployment',
        AZURE_OPENAI_API_VERSION: '2023-12-01-preview',
        AZURE_OPENAI_TEMPERATURE: 0.8,
      };

      // Should not throw - configuration should be valid
      expect(() => createProvider(envConfig)).not.toThrow();
    });

    it('passes Anthropic configuration correctly', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-custom-key',
        ANTHROPIC_MODEL: 'claude-3-haiku-20240307',
        ANTHROPIC_MAX_TOKENS: 2048,
        ANTHROPIC_TEMPERATURE: 0.5,
      };

      // Should not throw - configuration should be valid
      expect(() => createProvider(envConfig)).not.toThrow();
    });

    it('passes debug options to Azure OpenAI provider', () => {
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

    it('passes debug options to Anthropic provider', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
      };

      const options = {
        debug: true,
        showPrompt: false,
        showPromptTrunc: true,
        debugJson: false,
      };

      // Should not throw - provider creation should work with options
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
        LLM_PROVIDER: 'openai', // Not supported, only azure-openai
      } as unknown as EnvConfig;

      expect(() => createProvider(envConfig)).toThrow('Unsupported provider type: openai');
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

  describe('Backward Compatibility', () => {
    it('maintains consistent interface for Azure OpenAI provider', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: 'azure-openai',
        AZURE_OPENAI_API_KEY: 'legacy-key',
        AZURE_OPENAI_ENDPOINT: 'https://legacy.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'legacy-deployment',
        AZURE_OPENAI_API_VERSION: '2024-02-15-preview',
      };

      const provider = createProvider(envConfig);
      
      // Should implement the LLMProvider interface
      expect(provider).toHaveProperty('runPromptStructured');
      expect(typeof provider.runPromptStructured).toBe('function');
    });

    it('maintains consistent interface for Anthropic provider', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
      };

      const provider = createProvider(envConfig);
      
      // Should implement the LLMProvider interface
      expect(provider).toHaveProperty('runPromptStructured');
      expect(typeof provider.runPromptStructured).toBe('function');
    });

    it('works with existing Azure OpenAI configurations without changes', () => {
      // Simulate an existing configuration that worked before Anthropic support
      const existingConfig: EnvConfig = {
        LLM_PROVIDER: 'azure-openai',
        AZURE_OPENAI_API_KEY: 'existing-api-key',
        AZURE_OPENAI_ENDPOINT: 'https://existing.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'existing-deployment',
        AZURE_OPENAI_API_VERSION: '2024-02-15-preview',
        AZURE_OPENAI_TEMPERATURE: 1.0,
      };

      const provider = createProvider(existingConfig, {
        debug: false,
        showPrompt: false,
        showPromptTrunc: false,
        debugJson: false,
      });

      expect(provider).toBeInstanceOf(AzureOpenAIProvider);
    });
  });

  describe('Provider-Specific Configuration', () => {
    it('handles Azure OpenAI specific fields correctly', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: 'azure-openai',
        AZURE_OPENAI_API_KEY: 'test-key',
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'test-deployment',
        AZURE_OPENAI_API_VERSION: '2024-02-15-preview',
        AZURE_OPENAI_TEMPERATURE: 1.5,
      };

      // Should create provider successfully with Azure-specific config
      expect(() => createProvider(envConfig)).not.toThrow();
    });

    it('handles Anthropic specific fields correctly', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        ANTHROPIC_MODEL: 'claude-3-opus-20240229',
        ANTHROPIC_MAX_TOKENS: 8192,
        ANTHROPIC_TEMPERATURE: 0.9,
      };

      // Should create provider successfully with Anthropic-specific config
      expect(() => createProvider(envConfig)).not.toThrow();
    });

    it('creates providers with different temperature ranges', () => {
      // Azure OpenAI supports 0-2 temperature range
      const azureConfig: EnvConfig = {
        LLM_PROVIDER: 'azure-openai',
        AZURE_OPENAI_API_KEY: 'test-key',
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'test-deployment',
        AZURE_OPENAI_TEMPERATURE: 2.0,
      };

      // Anthropic supports 0-1 temperature range
      const anthropicConfig: EnvConfig = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        ANTHROPIC_TEMPERATURE: 1.0,
      };

      expect(() => createProvider(azureConfig)).not.toThrow();
      expect(() => createProvider(anthropicConfig)).not.toThrow();
    });
  });

  describe('Options Handling', () => {
    it('works without options parameter', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: 'azure-openai',
        AZURE_OPENAI_API_KEY: 'test-key',
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'test-deployment',
      };

      expect(() => createProvider(envConfig)).not.toThrow();
    });

    it('works with empty options object', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
      };

      expect(() => createProvider(envConfig, {})).not.toThrow();
    });

    it('works with partial options', () => {
      const envConfig: EnvConfig = {
        LLM_PROVIDER: 'azure-openai',
        AZURE_OPENAI_API_KEY: 'test-key',
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'test-deployment',
      };

      expect(() => createProvider(envConfig, { debug: true })).not.toThrow();
      expect(() => createProvider(envConfig, { showPrompt: true })).not.toThrow();
      expect(() => createProvider(envConfig, { debugJson: true })).not.toThrow();
    });

    it('handles all debug options for both providers', () => {
      const azureConfig: EnvConfig = {
        LLM_PROVIDER: 'azure-openai',
        AZURE_OPENAI_API_KEY: 'test-key',
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'test-deployment',
      };

      const anthropicConfig: EnvConfig = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
      };

      const allOptions = {
        debug: true,
        showPrompt: true,
        showPromptTrunc: true,
        debugJson: true,
      };

      expect(() => createProvider(azureConfig, allOptions)).not.toThrow();
      expect(() => createProvider(anthropicConfig, allOptions)).not.toThrow();
    });
  });
});