import type { LLMProvider } from '../providers/llm-provider';
import type { ModelCapabilityTier } from '../providers/model-capability';
import type { EvaluationOptions } from './types';

export interface AgentModeCapabilityAccess {
  defaultProvider: LLMProvider;
  resolveCapabilityProvider: (requested: ModelCapabilityTier) => LLMProvider;
}

export function createAgentModeCapabilityAccess(
  options: Pick<EvaluationOptions, 'provider' | 'capabilityProviderResolver'>
): AgentModeCapabilityAccess {
  const capabilityProviderResolver = options.capabilityProviderResolver;
  if (capabilityProviderResolver) {
    return {
      defaultProvider: capabilityProviderResolver.defaultProvider,
      resolveCapabilityProvider: (requested: ModelCapabilityTier): LLMProvider =>
        capabilityProviderResolver.resolveCapabilityProvider(requested),
    };
  }

  return {
    defaultProvider: options.provider,
    resolveCapabilityProvider: (requested: ModelCapabilityTier): LLMProvider => {
      void requested;
      return options.provider;
    },
  };
}
