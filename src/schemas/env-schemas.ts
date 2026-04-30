import { z } from 'zod';
import { ProviderType } from '../providers/provider-factory';

// Default configurations (previously from provider files)
export const AZURE_OPENAI_DEFAULT_CONFIG = {
  apiVersion: '2024-02-15-preview',
};

export const ANTHROPIC_DEFAULT_CONFIG = {
  model: 'claude-3-sonnet-20240229',
  maxTokens: 4096,
};

export const OPENAI_DEFAULT_CONFIG = {
  model: 'gpt-4o',
};

export const GEMINI_DEFAULT_CONFIG = {
  model: 'gemini-2.5-flash',
};

export const BEDROCK_DEFAULT_CONFIG = {
  model: 'global.anthropic.claude-sonnet-4-5-20250929-v1:0',
};

export const OBSERVABILITY_BACKENDS = ['langfuse'] as const;
export type ObservabilityBackend = (typeof OBSERVABILITY_BACKENDS)[number];

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

// Amazon Bedrock configuration schema
const BEDROCK_CONFIG_SCHEMA = z.object({
  AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  AWS_REGION: z.string().min(1),
  BEDROCK_MODEL: z.string().default(BEDROCK_DEFAULT_CONFIG.model),
  BEDROCK_TEMPERATURE: z.coerce.number().min(0).max(1).optional(),
});

const OBSERVABILITY_ENV_SCHEMA = z.object({
  OBSERVABILITY_BACKEND: z.enum(OBSERVABILITY_BACKENDS).optional(),
  LANGFUSE_PUBLIC_KEY: z.string().min(1).optional(),
  LANGFUSE_SECRET_KEY: z.string().min(1).optional(),
  LANGFUSE_BASE_URL: z.string().url().optional(),
});

// Base environment schema with shared optional variables
const BASE_ENV_SCHEMA = z.object({
  INPUT_PRICE_PER_MILLION: z.coerce.number().positive().optional(),
  OUTPUT_PRICE_PER_MILLION: z.coerce.number().positive().optional(),
}).merge(OBSERVABILITY_ENV_SCHEMA);

// Discriminated union based on provider type
export const ENV_SCHEMA = z.discriminatedUnion('LLM_PROVIDER', [
  z.object({ LLM_PROVIDER: z.literal(ProviderType.AzureOpenAI) }).merge(AZURE_OPENAI_CONFIG_SCHEMA).merge(BASE_ENV_SCHEMA),
  z.object({ LLM_PROVIDER: z.literal(ProviderType.Anthropic) }).merge(ANTHROPIC_CONFIG_SCHEMA).merge(BASE_ENV_SCHEMA),
  z.object({ LLM_PROVIDER: z.literal(ProviderType.OpenAI) }).merge(OPENAI_CONFIG_SCHEMA).merge(BASE_ENV_SCHEMA),
  z.object({ LLM_PROVIDER: z.literal(ProviderType.Gemini) }).merge(GEMINI_CONFIG_SCHEMA).merge(BASE_ENV_SCHEMA),
  z.object({ LLM_PROVIDER: z.literal(ProviderType.AmazonBedrock) }).merge(BEDROCK_CONFIG_SCHEMA).merge(BASE_ENV_SCHEMA),
]).superRefine((data, ctx) => {
  if (data.LLM_PROVIDER === ProviderType.AmazonBedrock) {
    const hasKey = data.AWS_ACCESS_KEY_ID !== undefined;
    const hasSecret = data.AWS_SECRET_ACCESS_KEY !== undefined;
    if (hasKey !== hasSecret) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must both be provided or both be omitted',
      });
    }
  }

  if (data.OBSERVABILITY_BACKEND === OBSERVABILITY_BACKENDS[0]) {
    if (!data.LANGFUSE_PUBLIC_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LANGFUSE_PUBLIC_KEY'],
        message: 'LANGFUSE_PUBLIC_KEY is required when OBSERVABILITY_BACKEND=langfuse',
      });
    }

    if (!data.LANGFUSE_SECRET_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LANGFUSE_SECRET_KEY'],
        message: 'LANGFUSE_SECRET_KEY is required when OBSERVABILITY_BACKEND=langfuse',
      });
    }
  }
});

export const GLOBAL_CONFIG_SCHEMA = z.object({
  env: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

// Inferred types
export type EnvConfig = z.infer<typeof ENV_SCHEMA>;
export type AzureOpenAIConfig = z.infer<typeof AZURE_OPENAI_CONFIG_SCHEMA>;
export type AnthropicConfig = z.infer<typeof ANTHROPIC_CONFIG_SCHEMA>;
export type OpenAIConfig = z.infer<typeof OPENAI_CONFIG_SCHEMA>;
export type GeminiConfig = z.infer<typeof GEMINI_CONFIG_SCHEMA>;
export type BedrockConfig = z.infer<typeof BEDROCK_CONFIG_SCHEMA>;
