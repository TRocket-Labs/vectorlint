import { z } from 'zod';
import { ProviderType } from '../providers/provider-factory';
import { GeminiDefaultConfig } from '../providers/gemini-provider';
import { OpenAIDefaultConfig } from '../providers/openai-provider';
import { AnthropicDefaultConfig } from '../providers/anthropic-provider';
import { AzureOpenAIDefaultConfig } from '../providers/azure-openai-provider';

// Azure OpenAI configuration schema
const AZURE_OPENAI_CONFIG_SCHEMA = z.object({
  AZURE_OPENAI_API_KEY: z.string().min(1),
  AZURE_OPENAI_ENDPOINT: z.string().url(),
  AZURE_OPENAI_DEPLOYMENT_NAME: z.string().min(1),
  AZURE_OPENAI_API_VERSION: z.string().default(AzureOpenAIDefaultConfig.apiVersion),
  AZURE_OPENAI_TEMPERATURE: z.coerce.number().min(0).max(2).optional(),
});

// Anthropic configuration schema
const ANTHROPIC_CONFIG_SCHEMA = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().default(AnthropicDefaultConfig.model),
  ANTHROPIC_MAX_TOKENS: z.coerce.number().positive().default(4096),
  ANTHROPIC_TEMPERATURE: z.coerce.number().min(0).max(1).optional(),
});

// OpenAI configuration schema
const OPENAI_CONFIG_SCHEMA = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().optional().default(OpenAIDefaultConfig.model),
  OPENAI_TEMPERATURE: z.coerce.number().min(0).max(2).optional(),
});

// Gemini configuration schema
const GEMINI_CONFIG_SCHEMA = z.object({
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().default(GeminiDefaultConfig.model),
  GEMINI_TEMPERATURE: z.coerce.number().min(0).max(1).optional(),
});

// Discriminated union based on provider type
export const ENV_SCHEMA = z.discriminatedUnion('LLM_PROVIDER', [
  z.object({ LLM_PROVIDER: z.literal(ProviderType.AzureOpenAI) }).merge(AZURE_OPENAI_CONFIG_SCHEMA),
  z.object({ LLM_PROVIDER: z.literal(ProviderType.Anthropic) }).merge(ANTHROPIC_CONFIG_SCHEMA),
  z.object({ LLM_PROVIDER: z.literal(ProviderType.OpenAI) }).merge(OPENAI_CONFIG_SCHEMA),
  z.object({ LLM_PROVIDER: z.literal(ProviderType.Gemini) }).merge(GEMINI_CONFIG_SCHEMA),
]);

// Backward compatibility: if no LLM_PROVIDER is specified, default to azure-openai
export const ENV_SCHEMA_WITH_DEFAULTS = z.preprocess(
  (data: unknown) => {
    if (typeof data === 'object' && data !== null && !('LLM_PROVIDER' in data)) {
      return { ...data, LLM_PROVIDER: ProviderType.AzureOpenAI };
    }
    return data;
  },
  ENV_SCHEMA
);

// Inferred types
export type EnvConfig = z.infer<typeof ENV_SCHEMA>;
export type AzureOpenAIConfig = z.infer<typeof AZURE_OPENAI_CONFIG_SCHEMA>;
export type AnthropicConfig = z.infer<typeof ANTHROPIC_CONFIG_SCHEMA>;
export type OpenAIConfig = z.infer<typeof OPENAI_CONFIG_SCHEMA>;
export type GeminiConfig = z.infer<typeof GEMINI_CONFIG_SCHEMA>;
