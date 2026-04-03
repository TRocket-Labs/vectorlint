import type { EnvConfig } from '../schemas/env-schemas';
import type { ModelCapabilityTier } from './model-capability';
import { resolveConfiguredModelForCapability } from './model-capability';
import type { LLMProvider } from './llm-provider';
import {
  createProviderForModel,
  getDefaultProviderModelIdentifier,
  type ProviderOptions,
} from './provider-factory';
import type { RequestBuilder } from './request-builder';

export interface CapabilityProviderResolver {
  defaultProvider: LLMProvider;
  resolveCapabilityProvider(requested: ModelCapabilityTier): LLMProvider;
}

export function createCapabilityProviderResolver(
  envConfig: EnvConfig,
  options: ProviderOptions = {},
  builder?: RequestBuilder
): CapabilityProviderResolver {
  const defaultModelIdentifier = getDefaultProviderModelIdentifier(envConfig);
  const providerCache = new Map<string, LLMProvider>();

  const getOrCreateProvider = (modelIdentifier: string): LLMProvider => {
    const cachedProvider = providerCache.get(modelIdentifier);
    if (cachedProvider) {
      return cachedProvider;
    }

    const provider = createProviderForModel(envConfig, modelIdentifier, options, builder);
    providerCache.set(modelIdentifier, provider);
    return provider;
  };

  const defaultProvider = getOrCreateProvider(defaultModelIdentifier);

  const resolveCapabilityProvider = (requested: ModelCapabilityTier): LLMProvider =>
    getOrCreateProvider(resolveConfiguredModelForCapability(envConfig, requested));

  return {
    defaultProvider,
    resolveCapabilityProvider,
  };
}
