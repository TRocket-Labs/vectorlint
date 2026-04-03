import { ProviderType } from './provider-factory';
import { ConfigError } from '../errors';
import type { EnvConfig } from '../schemas/env-schemas';

export const MODEL_CAPABILITY_TIERS = ['high-capability', 'mid-capability', 'low-capability'] as const;

export type ModelCapabilityTier = typeof MODEL_CAPABILITY_TIERS[number];

const TIER_SEARCH_ORDER: Record<ModelCapabilityTier, readonly ModelCapabilityTier[]> = {
  'low-capability': ['low-capability', 'mid-capability', 'high-capability'],
  'mid-capability': ['mid-capability', 'high-capability'],
  'high-capability': ['high-capability'],
};

function resolveCapabilityValue(
  requested: ModelCapabilityTier,
  values: Partial<Record<ModelCapabilityTier, string>>,
  defaultValue: string
): string {
  for (const tier of TIER_SEARCH_ORDER[requested]) {
    const value = values[tier];
    if (value) {
      return value;
    }
  }

  return defaultValue;
}

export function resolveConfiguredModelForCapability(
  envConfig: EnvConfig,
  requested: ModelCapabilityTier
): string {
  switch (envConfig.LLM_PROVIDER) {
    case ProviderType.AzureOpenAI:
      return resolveCapabilityValue(
        requested,
        {
          'high-capability': envConfig.AZURE_OPENAI_HIGH_CAPABILITY_DEPLOYMENT_NAME,
          'mid-capability': envConfig.AZURE_OPENAI_MID_CAPABILITY_DEPLOYMENT_NAME,
          'low-capability': envConfig.AZURE_OPENAI_LOW_CAPABILITY_DEPLOYMENT_NAME,
        },
        envConfig.AZURE_OPENAI_DEPLOYMENT_NAME
      );

    case ProviderType.Anthropic:
      return resolveCapabilityValue(
        requested,
        {
          'high-capability': envConfig.ANTHROPIC_HIGH_CAPABILITY_MODEL,
          'mid-capability': envConfig.ANTHROPIC_MID_CAPABILITY_MODEL,
          'low-capability': envConfig.ANTHROPIC_LOW_CAPABILITY_MODEL,
        },
        envConfig.ANTHROPIC_MODEL
      );

    case ProviderType.OpenAI:
      return resolveCapabilityValue(
        requested,
        {
          'high-capability': envConfig.OPENAI_HIGH_CAPABILITY_MODEL,
          'mid-capability': envConfig.OPENAI_MID_CAPABILITY_MODEL,
          'low-capability': envConfig.OPENAI_LOW_CAPABILITY_MODEL,
        },
        envConfig.OPENAI_MODEL
      );

    case ProviderType.Gemini:
      return resolveCapabilityValue(
        requested,
        {
          'high-capability': envConfig.GEMINI_HIGH_CAPABILITY_MODEL,
          'mid-capability': envConfig.GEMINI_MID_CAPABILITY_MODEL,
          'low-capability': envConfig.GEMINI_LOW_CAPABILITY_MODEL,
        },
        envConfig.GEMINI_MODEL
      );

    case ProviderType.AmazonBedrock:
      return resolveCapabilityValue(
        requested,
        {
          'high-capability': envConfig.BEDROCK_HIGH_CAPABILITY_MODEL,
          'mid-capability': envConfig.BEDROCK_MID_CAPABILITY_MODEL,
          'low-capability': envConfig.BEDROCK_LOW_CAPABILITY_MODEL,
        },
        envConfig.BEDROCK_MODEL
      );

    default:
      throw new ConfigError(
        `Unsupported provider type: ${(envConfig as { LLM_PROVIDER?: string }).LLM_PROVIDER}`
      );
  }
}
