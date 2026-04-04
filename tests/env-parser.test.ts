import { describe, it, expect } from 'vitest';
import { parseEnvironment } from '../src/boundaries/env-parser';
import { ValidationError } from '../src/errors/index';
import { ProviderType } from '../src/providers/provider-factory';
import { AZURE_OPENAI_DEFAULT_CONFIG, ANTHROPIC_DEFAULT_CONFIG, OPENAI_DEFAULT_CONFIG } from '../src/schemas/env-schemas';

describe('Environment Parser', () => {
  describe('Azure OpenAI Configuration', () => {
    it('parses valid Azure OpenAI environment variables', () => {
      const env = {
        LLM_PROVIDER: 'azure-openai',
        AZURE_OPENAI_API_KEY: 'test-key',
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'test-deployment',
        AZURE_OPENAI_API_VERSION: '2024-02-15-preview',
        AZURE_OPENAI_TEMPERATURE: '0.7',
      };

      const result = parseEnvironment(env);

      expect(result.LLM_PROVIDER).toBe('azure-openai');
      if (result.LLM_PROVIDER === ProviderType.AzureOpenAI) {
        expect(result.AZURE_OPENAI_API_KEY).toBe('test-key');
        expect(result.AZURE_OPENAI_ENDPOINT).toBe('https://test.openai.azure.com');
        expect(result.AZURE_OPENAI_DEPLOYMENT_NAME).toBe('test-deployment');
        expect(result.AZURE_OPENAI_API_VERSION).toBe('2024-02-15-preview');
        expect(result.AZURE_OPENAI_TEMPERATURE).toBe(0.7);
      }
    });

    it('uses default values for optional Azure OpenAI fields', () => {
      const env = {
        LLM_PROVIDER: 'azure-openai',
        AZURE_OPENAI_API_KEY: 'test-key',
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'test-deployment',
      };

      const result = parseEnvironment(env);

      if (result.LLM_PROVIDER === ProviderType.AzureOpenAI) {
        expect(result.AZURE_OPENAI_API_VERSION).toBe(AZURE_OPENAI_DEFAULT_CONFIG.apiVersion);
        expect(result.AZURE_OPENAI_TEMPERATURE).toBeUndefined();
      }
    });

    it('throws validation error for missing required Azure OpenAI fields', () => {
      const env = {
        LLM_PROVIDER: 'azure-openai',
        AZURE_OPENAI_API_KEY: 'test-key',
        // Missing AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_DEPLOYMENT_NAME
      };

      expect(() => parseEnvironment(env)).toThrow(ValidationError);
      expect(() => parseEnvironment(env)).toThrow(/Azure OpenAI environment variables/);
    });

    it('parses provider-scoped capability-tier deployment fields', () => {
      const env = {
        LLM_PROVIDER: 'azure-openai',
        AZURE_OPENAI_API_KEY: 'test-key',
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'default-deployment',
        AZURE_OPENAI_LOW_CAPABILITY_DEPLOYMENT_NAME: 'low-deployment',
        AZURE_OPENAI_MID_CAPABILITY_DEPLOYMENT_NAME: 'mid-deployment',
        AZURE_OPENAI_HIGH_CAPABILITY_DEPLOYMENT_NAME: 'high-deployment',
      };

      const result = parseEnvironment(env);

      if (result.LLM_PROVIDER === ProviderType.AzureOpenAI) {
        expect(result.AZURE_OPENAI_LOW_CAPABILITY_DEPLOYMENT_NAME).toBe('low-deployment');
        expect(result.AZURE_OPENAI_MID_CAPABILITY_DEPLOYMENT_NAME).toBe('mid-deployment');
        expect(result.AZURE_OPENAI_HIGH_CAPABILITY_DEPLOYMENT_NAME).toBe('high-deployment');
      }
    });
  });

  describe('Anthropic Configuration', () => {
    it('parses valid Anthropic environment variables', () => {
      const env = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        ANTHROPIC_MODEL: 'claude-3-haiku-20240307',
        ANTHROPIC_MAX_TOKENS: '2048',
        ANTHROPIC_TEMPERATURE: '0.5',
      };

      const result = parseEnvironment(env);

      expect(result.LLM_PROVIDER).toBe('anthropic');
      if (result.LLM_PROVIDER === ProviderType.Anthropic) {
        expect(result.ANTHROPIC_API_KEY).toBe('sk-ant-test-key');
        expect(result.ANTHROPIC_MODEL).toBe('claude-3-haiku-20240307');
        expect(result.ANTHROPIC_MAX_TOKENS).toBe(2048);
        expect(result.ANTHROPIC_TEMPERATURE).toBe(0.5);
      }
    });

    it('uses default values for optional Anthropic fields', () => {
      const env = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
      };

      const result = parseEnvironment(env);

      if (result.LLM_PROVIDER === ProviderType.Anthropic) {
        expect(result.ANTHROPIC_MODEL).toBe(ANTHROPIC_DEFAULT_CONFIG.model);
        expect(result.ANTHROPIC_MAX_TOKENS).toBe(4096);
        expect(result.ANTHROPIC_TEMPERATURE).toBeUndefined();
      }
    });

    it('throws validation error for missing required Anthropic fields', () => {
      const env = {
        LLM_PROVIDER: 'anthropic',
        // Missing ANTHROPIC_API_KEY
      };

      expect(() => parseEnvironment(env)).toThrow(ValidationError);
      expect(() => parseEnvironment(env)).toThrow(/Anthropic environment variables/);
    });

    it('parses provider-scoped capability-tier model fields', () => {
      const env = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        ANTHROPIC_LOW_CAPABILITY_MODEL: 'claude-3-haiku-20240307',
        ANTHROPIC_MID_CAPABILITY_MODEL: 'claude-3-5-sonnet-20241022',
        ANTHROPIC_HIGH_CAPABILITY_MODEL: 'claude-opus-4-20250514',
      };

      const result = parseEnvironment(env);

      if (result.LLM_PROVIDER === ProviderType.Anthropic) {
        expect(result.ANTHROPIC_LOW_CAPABILITY_MODEL).toBe('claude-3-haiku-20240307');
        expect(result.ANTHROPIC_MID_CAPABILITY_MODEL).toBe('claude-3-5-sonnet-20241022');
        expect(result.ANTHROPIC_HIGH_CAPABILITY_MODEL).toBe('claude-opus-4-20250514');
      }
    });
  });

  describe('OpenAI Configuration', () => {
    it('parses valid OpenAI environment variables', () => {
      const env = {
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-test-key',
        OPENAI_MODEL: 'gpt-4o-mini',
        OPENAI_TEMPERATURE: '0.8',
      };

      const result = parseEnvironment(env);

      expect(result.LLM_PROVIDER).toBe(ProviderType.OpenAI);
      if (result.LLM_PROVIDER === ProviderType.OpenAI) {
        expect(result.OPENAI_API_KEY).toBe('sk-test-key');
        expect(result.OPENAI_MODEL).toBe('gpt-4o-mini');
        expect(result.OPENAI_TEMPERATURE).toBe(0.8);
      }
    });

    it('uses default values for optional OpenAI fields', () => {
      const env = {
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-test-key',
      };

      const result = parseEnvironment(env);

      if (result.LLM_PROVIDER === ProviderType.OpenAI) {
        expect(result.OPENAI_MODEL).toBe(OPENAI_DEFAULT_CONFIG.model);
        expect(result.OPENAI_TEMPERATURE).toBeUndefined();
      }
    });

    it('throws validation error for missing required OpenAI fields', () => {
      const env = {
        LLM_PROVIDER: 'openai',
        // Missing OPENAI_API_KEY
      };

      expect(() => parseEnvironment(env)).toThrow(ValidationError);
      expect(() => parseEnvironment(env)).toThrow(/OpenAI environment variables/);
    });

    it('parses provider-scoped capability-tier model fields', () => {
      const env = {
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-test-key',
        OPENAI_MODEL: 'gpt-4o',
        OPENAI_LOW_CAPABILITY_MODEL: 'gpt-4o-mini',
        OPENAI_MID_CAPABILITY_MODEL: 'gpt-4o',
        OPENAI_HIGH_CAPABILITY_MODEL: 'gpt-4.1',
      };

      const result = parseEnvironment(env);

      if (result.LLM_PROVIDER === ProviderType.OpenAI) {
        expect(result.OPENAI_LOW_CAPABILITY_MODEL).toBe('gpt-4o-mini');
        expect(result.OPENAI_MID_CAPABILITY_MODEL).toBe('gpt-4o');
        expect(result.OPENAI_HIGH_CAPABILITY_MODEL).toBe('gpt-4.1');
      }
    });

    it('validates OpenAI temperature range (0-2)', () => {
      const validEnv = {
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-test-key',
        OPENAI_TEMPERATURE: '1.5',
      };

      expect(() => parseEnvironment(validEnv)).not.toThrow();

      const invalidEnv = {
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-test-key',
        OPENAI_TEMPERATURE: '2.5', // Above max of 2
      };

      expect(() => parseEnvironment(invalidEnv)).toThrow(ValidationError);
    });

    it('validates OpenAI API key format', () => {
      const invalidEnv = {
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: '', // Empty string should fail
      };

      expect(() => parseEnvironment(invalidEnv)).toThrow(ValidationError);
      expect(() => parseEnvironment(invalidEnv)).toThrow(/Invalid environment variable values.*OPENAI_API_KEY.*String must contain at least 1 character/);
    });

  });

  describe('Gemini and Amazon Bedrock Configuration', () => {
    it('parses provider-scoped capability-tier model fields', () => {
      const geminiEnv = {
        LLM_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'gemini-key',
        GEMINI_LOW_CAPABILITY_MODEL: 'gemini-2.0-flash',
        GEMINI_MID_CAPABILITY_MODEL: 'gemini-2.5-flash',
        GEMINI_HIGH_CAPABILITY_MODEL: 'gemini-2.5-pro',
      };

      const bedrockEnv = {
        LLM_PROVIDER: 'amazon-bedrock',
        AWS_REGION: 'us-east-1',
        BEDROCK_LOW_CAPABILITY_MODEL: 'anthropic.claude-3-haiku-20240307-v1:0',
        BEDROCK_MID_CAPABILITY_MODEL: 'anthropic.claude-3-sonnet-20240229-v1:0',
        BEDROCK_HIGH_CAPABILITY_MODEL: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
      };

      const geminiResult = parseEnvironment(geminiEnv);
      const bedrockResult = parseEnvironment(bedrockEnv);

      if (geminiResult.LLM_PROVIDER === ProviderType.Gemini) {
        expect(geminiResult.GEMINI_LOW_CAPABILITY_MODEL).toBe('gemini-2.0-flash');
        expect(geminiResult.GEMINI_MID_CAPABILITY_MODEL).toBe('gemini-2.5-flash');
        expect(geminiResult.GEMINI_HIGH_CAPABILITY_MODEL).toBe('gemini-2.5-pro');
      }

      if (bedrockResult.LLM_PROVIDER === ProviderType.AmazonBedrock) {
        expect(bedrockResult.BEDROCK_LOW_CAPABILITY_MODEL).toBe('anthropic.claude-3-haiku-20240307-v1:0');
        expect(bedrockResult.BEDROCK_MID_CAPABILITY_MODEL).toBe('anthropic.claude-3-sonnet-20240229-v1:0');
        expect(bedrockResult.BEDROCK_HIGH_CAPABILITY_MODEL).toBe('anthropic.claude-3-5-sonnet-20240620-v1:0');
      }
    });
  });

  describe('Backward Compatibility', () => {
    it('requires LLM_PROVIDER to be explicitly specified', () => {
      const env = {
        AZURE_OPENAI_API_KEY: 'test-key',
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'test-deployment',
      };

      expect(() => parseEnvironment(env)).toThrow(ValidationError);
      expect(() => parseEnvironment(env)).toThrow(/LLM_PROVIDER is required/);
    });
    it('requires LLM_PROVIDER even when Azure config is present', () => {
      const env = {
        AZURE_OPENAI_API_KEY: 'existing-key',
        AZURE_OPENAI_ENDPOINT: 'https://existing.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'existing-deployment',
        AZURE_OPENAI_API_VERSION: '2023-12-01-preview',
        AZURE_OPENAI_TEMPERATURE: '1.0',
      };

      expect(() => parseEnvironment(env)).toThrow(ValidationError);
      expect(() => parseEnvironment(env)).toThrow(/LLM_PROVIDER is required/);
    });
  });

  describe('Provider Selection Validation', () => {
    it('throws validation error for invalid provider type', () => {
      const env = {
        LLM_PROVIDER: 'invalid-provider',
        AZURE_OPENAI_API_KEY: 'test-key',
      };

      expect(() => parseEnvironment(env)).toThrow(ValidationError);
      expect(() => parseEnvironment(env)).toThrow(/LLM_PROVIDER is required and must be either 'azure-openai', 'anthropic', or 'openai'/);
    });

    it('provides specific error message for missing Azure OpenAI variables', () => {
      const env = {
        LLM_PROVIDER: 'azure-openai',
        AZURE_OPENAI_API_KEY: 'test-key',
        // Missing AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_DEPLOYMENT_NAME
      };

      expect(() => parseEnvironment(env)).toThrow(ValidationError);
      expect(() => parseEnvironment(env)).toThrow(/Missing required Azure OpenAI environment variables.*AZURE_OPENAI_ENDPOINT.*AZURE_OPENAI_DEPLOYMENT_NAME/);
    });

    it('provides specific error message for missing Anthropic variables', () => {
      const env = {
        LLM_PROVIDER: 'anthropic',
        // Missing ANTHROPIC_API_KEY
      };

      expect(() => parseEnvironment(env)).toThrow(ValidationError);
      expect(() => parseEnvironment(env)).toThrow(/Missing required Anthropic environment variables.*ANTHROPIC_API_KEY/);
    });

    it('provides specific error message for missing OpenAI variables', () => {
      const env = {
        LLM_PROVIDER: 'openai',
        // Missing OPENAI_API_KEY
      };

      expect(() => parseEnvironment(env)).toThrow(ValidationError);
      expect(() => parseEnvironment(env)).toThrow(/Missing required OpenAI environment variables.*OPENAI_API_KEY/);
    });

    it('validates temperature ranges correctly for each provider', () => {
      // Azure OpenAI allows 0-2 range
      const azureEnv = {
        LLM_PROVIDER: 'azure-openai',
        AZURE_OPENAI_API_KEY: 'test-key',
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'test-deployment',
        AZURE_OPENAI_TEMPERATURE: '1.5',
      };

      expect(() => parseEnvironment(azureEnv)).not.toThrow();

      // Anthropic allows 0-1 range
      const anthropicEnv = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        ANTHROPIC_TEMPERATURE: '0.8',
      };

      expect(() => parseEnvironment(anthropicEnv)).not.toThrow();

      // OpenAI allows 0-2 range
      const openaiEnv = {
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-test-key',
        OPENAI_TEMPERATURE: '1.8',
      };

      expect(() => parseEnvironment(openaiEnv)).not.toThrow();

      // Test invalid temperature for Anthropic (> 1)
      const invalidAnthropicEnv = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        ANTHROPIC_TEMPERATURE: '1.5',
      };

      expect(() => parseEnvironment(invalidAnthropicEnv)).toThrow();

      // Test invalid temperature for OpenAI (> 2)
      const invalidOpenaiEnv = {
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-test-key',
        OPENAI_TEMPERATURE: '2.5',
      };

      expect(() => parseEnvironment(invalidOpenaiEnv)).toThrow();
    });

    it('provides specific error message for invalid field values', () => {
      const env = {
        LLM_PROVIDER: 'azure-openai',
        AZURE_OPENAI_API_KEY: '', // Empty string should fail min(1) validation
        AZURE_OPENAI_ENDPOINT: 'not-a-url', // Invalid URL
        AZURE_OPENAI_DEPLOYMENT_NAME: 'test-deployment',
      };

      expect(() => parseEnvironment(env)).toThrow(ValidationError);
      expect(() => parseEnvironment(env)).toThrow(/Invalid environment variable values/);
    });
  });
});
