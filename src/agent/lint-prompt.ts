import type { PromptFile } from '../prompts/prompt-loader';

export type LintRuleCall = {
  ruleSource: string;
  prompt: PromptFile;
  reviewInstruction?: string;
  context?: string;
};

export const MERGED_LINT_REVIEW_INSTRUCTIONS = [
  'Review the file against all of the following source-backed rules.',
  'Keep findings attributed to the exact ruleSource that each issue belongs to.',
] as const;

export function buildEffectiveRuleBody(
  prompt: PromptFile,
  params: { reviewInstruction?: string; context?: string }
): string {
  const reviewInstruction = params.reviewInstruction?.trim();
  const context = params.context?.trim();
  const body = reviewInstruction || prompt.body;

  if (!context) {
    return body;
  }

  return `${body}\n\nRequired context for this review:\n${context}`;
}

export function buildMergedLintPrompt(ruleCalls: LintRuleCall[]): string {
  const sections = ruleCalls.flatMap((ruleCall, index) => [
    `Rule ${index + 1}`,
    `ruleSource: ${ruleCall.ruleSource}`,
    buildEffectiveRuleBody(ruleCall.prompt, ruleCall),
    '',
  ]);

  return sections.join('\n').trim();
}
