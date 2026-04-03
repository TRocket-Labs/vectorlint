import { ProviderType } from './provider-factory';
import { ConfigError } from '../errors';
import type { EnvConfig } from '../schemas/env-schemas';

export const HIGH_CAPABILITY_TIER = 'high-cap';
export const MID_CAPABILITY_TIER = 'mid-cap';
export const LOW_CAPABILITY_TIER = 'low-cap';

export const MODEL_CAPABILITY_TIERS = [
  HIGH_CAPABILITY_TIER,
  MID_CAPABILITY_TIER,
  LOW_CAPABILITY_TIER,
] as const;

export type ModelCapabilityTier = typeof MODEL_CAPABILITY_TIERS[number];

const TIER_SEARCH_ORDER: Record<ModelCapabilityTier, readonly ModelCapabilityTier[]> = {
  [LOW_CAPABILITY_TIER]: [LOW_CAPABILITY_TIER, MID_CAPABILITY_TIER, HIGH_CAPABILITY_TIER],
  [MID_CAPABILITY_TIER]: [MID_CAPABILITY_TIER, HIGH_CAPABILITY_TIER],
  [HIGH_CAPABILITY_TIER]: [HIGH_CAPABILITY_TIER],
};

function resolveCapabilityValue(
  requested: ModelCapabilityTier,
  values: Partial<Record<ModelCapabilityTier, string>>,
  defaultValue: string
): string {
  for (const tier of TIER_SEARCH_ORDER[requested]) {
    const value = values[tier];
    const normalizedValue = value?.trim();
    if (normalizedValue) {
      return normalizedValue;
    }
  }

  const normalizedDefaultValue = defaultValue.trim();
  if (normalizedDefaultValue) {
    return normalizedDefaultValue;
  }

  throw new ConfigError(
    `No configured model or deployment name found for requested capability tier: ${requested}`
  );
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
          [HIGH_CAPABILITY_TIER]: envConfig.AZURE_OPENAI_HIGH_CAPABILITY_DEPLOYMENT_NAME,
          [MID_CAPABILITY_TIER]: envConfig.AZURE_OPENAI_MID_CAPABILITY_DEPLOYMENT_NAME,
          [LOW_CAPABILITY_TIER]: envConfig.AZURE_OPENAI_LOW_CAPABILITY_DEPLOYMENT_NAME,
        },
        envConfig.AZURE_OPENAI_DEPLOYMENT_NAME
      );

    case ProviderType.Anthropic:
      return resolveCapabilityValue(
        requested,
        {
          [HIGH_CAPABILITY_TIER]: envConfig.ANTHROPIC_HIGH_CAPABILITY_MODEL,
          [MID_CAPABILITY_TIER]: envConfig.ANTHROPIC_MID_CAPABILITY_MODEL,
          [LOW_CAPABILITY_TIER]: envConfig.ANTHROPIC_LOW_CAPABILITY_MODEL,
        },
        envConfig.ANTHROPIC_MODEL
      );

    case ProviderType.OpenAI:
      return resolveCapabilityValue(
        requested,
        {
          [HIGH_CAPABILITY_TIER]: envConfig.OPENAI_HIGH_CAPABILITY_MODEL,
          [MID_CAPABILITY_TIER]: envConfig.OPENAI_MID_CAPABILITY_MODEL,
          [LOW_CAPABILITY_TIER]: envConfig.OPENAI_LOW_CAPABILITY_MODEL,
        },
        envConfig.OPENAI_MODEL
      );

    case ProviderType.Gemini:
      return resolveCapabilityValue(
        requested,
        {
          [HIGH_CAPABILITY_TIER]: envConfig.GEMINI_HIGH_CAPABILITY_MODEL,
          [MID_CAPABILITY_TIER]: envConfig.GEMINI_MID_CAPABILITY_MODEL,
          [LOW_CAPABILITY_TIER]: envConfig.GEMINI_LOW_CAPABILITY_MODEL,
        },
        envConfig.GEMINI_MODEL
      );

    case ProviderType.AmazonBedrock:
      return resolveCapabilityValue(
        requested,
        {
          [HIGH_CAPABILITY_TIER]: envConfig.BEDROCK_HIGH_CAPABILITY_MODEL,
          [MID_CAPABILITY_TIER]: envConfig.BEDROCK_MID_CAPABILITY_MODEL,
          [LOW_CAPABILITY_TIER]: envConfig.BEDROCK_LOW_CAPABILITY_MODEL,
        },
        envConfig.BEDROCK_MODEL
      );

    default:
      throw new ConfigError(
        `Unsupported provider type: ${(envConfig as { LLM_PROVIDER?: string }).LLM_PROVIDER}`
      );
  }
}
