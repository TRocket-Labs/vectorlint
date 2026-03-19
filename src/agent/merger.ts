import type { PromptEvaluationResult } from '../prompts/schema';
import type { AgentRunResult, MergedFinding } from './types';

export interface LintFindingEntry {
  file: string;
  result: PromptEvaluationResult;
}

export function mergeFindings(
  lintFindings: LintFindingEntry[],
  agentResults: AgentRunResult[]
): MergedFinding[] {
  const merged: MergedFinding[] = [];

  for (const entry of lintFindings) {
    merged.push({ source: 'lint', file: entry.file, result: entry.result });
  }

  for (const agentResult of agentResults) {
    for (const finding of agentResult.findings) {
      merged.push({ source: 'agent', finding });
    }
  }

  return merged;
}
