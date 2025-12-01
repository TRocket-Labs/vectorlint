import { describe, it, expect } from 'vitest';
import { parseEnvironment } from '../src/boundaries/env-parser';
import { ValidationError } from '../src/errors/index';

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
      if (result.LLM_PROVIDER === 'azure-openai') {
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

      if (result.LLM_PROVIDER === 'azure-openai') {
        expect(result.AZURE_OPENAI_API_VERSION).toBe('2024-02-15-preview');
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
      if (result.LLM_PROVIDER === 'anthropic') {
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

      if (result.LLM_PROVIDER === 'anthropic') {
        expect(result.ANTHROPIC_MODEL).toBe('claude-3-sonnet-20240229');
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

      expect(result.LLM_PROVIDER).toBe('openai');
      if (result.LLM_PROVIDER === 'openai') {
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

      if (result.LLM_PROVIDER === 'openai') {
        expect(result.OPENAI_MODEL).toBe('gpt-4o');
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