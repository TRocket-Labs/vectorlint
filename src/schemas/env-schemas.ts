import { z } from 'zod';
import { ProviderType } from '../providers/provider-factory';

// Default configurations (previously from provider files)
const AZURE_OPENAI_DEFAULT_CONFIG = {
  apiVersion: '2024-02-15-preview',
};

const ANTHROPIC_DEFAULT_CONFIG = {
  model: 'claude-3-sonnet-20240229',
  maxTokens: 4096,
};

const OPENAI_DEFAULT_CONFIG = {
  model: 'gpt-4o',
};

const GEMINI_DEFAULT_CONFIG = {
  model: 'gemini-2.5-flash',
};

// Azure OpenAI configuration schema
const AZURE_OPENAI_CONFIG_SCHEMA = z.object({
  AZURE_OPENAI_API_KEY: z.string().min(1),
  AZURE_OPENAI_ENDPOINT: z.string().url(),
  AZURE_OPENAI_DEPLOYMENT_NAME: z.string().min(1),
  AZURE_OPENAI_API_VERSION: z.string().default(AZURE_OPENAI_DEFAULT_CONFIG.apiVersion),
  AZURE_OPENAI_TEMPERATURE: z.coerce.number().min(0).max(2).optional(),
});

// Anthropic configuration schema
const ANTHROPIC_CONFIG_SCHEMA = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().default(ANTHROPIC_DEFAULT_CONFIG.model),
  ANTHROPIC_MAX_TOKENS: z.coerce.number().positive().default(4096),
  ANTHROPIC_TEMPERATURE: z.coerce.number().min(0).max(1).optional(),
});

// OpenAI configuration schema
const OPENAI_CONFIG_SCHEMA = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default(OPENAI_DEFAULT_CONFIG.model),
  OPENAI_TEMPERATURE: z.coerce.number().min(0).max(2).optional(),
});

// Gemini configuration schema
const GEMINI_CONFIG_SCHEMA = z.object({
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().default(GEMINI_DEFAULT_CONFIG.model),
  GEMINI_TEMPERATURE: z.coerce.number().min(0).max(1).optional(),
});

// Base environment schema with shared optional variables
const BASE_ENV_SCHEMA = z.object({
  INPUT_PRICE_PER_MILLION: z.coerce.number().positive().optional(),
  OUTPUT_PRICE_PER_MILLION: z.coerce.number().positive().optional(),
});

// Discriminated union based on provider type
export const ENV_SCHEMA = z.discriminatedUnion('LLM_PROVIDER', [
  z.object({ LLM_PROVIDER: z.literal(ProviderType.AzureOpenAI) }).merge(AZURE_OPENAI_CONFIG_SCHEMA).merge(BASE_ENV_SCHEMA),
  z.object({ LLM_PROVIDER: z.literal(ProviderType.Anthropic) }).merge(ANTHROPIC_CONFIG_SCHEMA).merge(BASE_ENV_SCHEMA),
  z.object({ LLM_PROVIDER: z.literal(ProviderType.OpenAI) }).merge(OPENAI_CONFIG_SCHEMA).merge(BASE_ENV_SCHEMA),
  z.object({ LLM_PROVIDER: z.literal(ProviderType.Gemini) }).merge(GEMINI_CONFIG_SCHEMA).merge(BASE_ENV_SCHEMA),
]);

export const GLOBAL_CONFIG_SCHEMA = z.object({
    env: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

// Inferred types
export type EnvConfig = z.infer<typeof ENV_SCHEMA>;
export type AzureOpenAIConfig = z.infer<typeof AZURE_OPENAI_CONFIG_SCHEMA>;
export type AnthropicConfig = z.infer<typeof ANTHROPIC_CONFIG_SCHEMA>;
export type OpenAIConfig = z.infer<typeof OPENAI_CONFIG_SCHEMA>;
export type GeminiConfig = z.infer<typeof GEMINI_CONFIG_SCHEMA>;
