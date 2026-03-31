import type { EvaluationOptions, EvaluationResult } from '../cli/types';

export async function runAgentModeEvaluation(
  targets: string[],
  _options: EvaluationOptions
): Promise<EvaluationResult> {
  return {
    totalFiles: targets.length,
    totalErrors: 0,
    totalWarnings: 0,
    requestFailures: 0,
    hadOperationalErrors: false,
    hadSeverityErrors: false,
    tokenUsage: {
      totalInputTokens: 0,
      totalOutputTokens: 0,
    },
  };
}

export * from './agent-executor';
export * from './review-session-store';
export * from './types';
