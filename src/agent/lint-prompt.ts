import type { RuleFile } from '../rules/rule-loader';

export type LintRuleCall = {
  ruleSource: string;
  rule: RuleFile;
  reviewInstruction?: string;
  context?: string;
};

export function resolveRuleContent(
  rule: RuleFile,
  params: { reviewInstruction?: string; context?: string }
): string {
  const reviewInstruction = params.reviewInstruction?.trim();
  const context = params.context?.trim();
  const body = reviewInstruction || rule.content;

  if (!context) {
    return body;
  }

  return `${body}\n\nRequired context for this review:\n${context}`;
}

export function mergeRulesForLint(ruleCalls: LintRuleCall[]): string {
  const sections = ruleCalls.flatMap((ruleCall, index) => [
    `Rule ${index + 1}`,
    `ruleSource: ${ruleCall.ruleSource}`,
    resolveRuleContent(ruleCall.rule, ruleCall),
    '',
  ]);

  return sections.join('\n').trim();
}
