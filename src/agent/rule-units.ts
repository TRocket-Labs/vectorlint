import type { RuleFile } from '../rules/rule-loader';
import { normalizeRuleSource } from './rule-id';
import { estimateTokens } from '../utils/token-estimate';

export interface MatchedRuleUnitRule {
  ruleSource: string;
}

export interface MatchedRuleUnit {
  file: string;
  rules: MatchedRuleUnitRule[];
  estimatedTokens: number;
}

const MATCHED_RULE_UNIT_FILE_OVERHEAD_TOKENS = 8;
const MATCHED_RULE_UNIT_RULE_OVERHEAD_TOKENS = 16;

export function estimateMatchedRuleUnitTokens(
  file: string,
  rules: MatchedRuleUnitRule[],
  ruleBySource: Map<string, RuleFile>
): number {
  return rules.reduce((total, rule) => {
    const normalizedSource = normalizeRuleSource(rule.ruleSource);
    const ruleFile = ruleBySource.get(normalizedSource);
    return total + MATCHED_RULE_UNIT_RULE_OVERHEAD_TOKENS + estimateTokens(ruleFile?.content ?? '');
  }, MATCHED_RULE_UNIT_FILE_OVERHEAD_TOKENS + estimateTokens(file));
}

export function buildMatchedRuleUnits(
  fileRuleMatches: Array<{ file: string; ruleSource: string }>,
  ruleBySource: Map<string, RuleFile>,
  tokenBudget: number
): MatchedRuleUnit[] {
  const matchesByFile = new Map<string, MatchedRuleUnitRule[]>();

  for (const match of fileRuleMatches) {
    const rules = matchesByFile.get(match.file) ?? [];
    rules.push({ ruleSource: normalizeRuleSource(match.ruleSource) });
    matchesByFile.set(match.file, rules);
  }

  const normalizedBudget = Math.max(1, Math.trunc(tokenBudget));
  const units: MatchedRuleUnit[] = [];

  for (const [file, rules] of matchesByFile.entries()) {
    let currentRules: MatchedRuleUnitRule[] = [];

    for (const rule of rules) {
      const nextRules = [...currentRules, rule];
      const nextEstimatedTokens = estimateMatchedRuleUnitTokens(file, nextRules, ruleBySource);

      if (currentRules.length > 0 && nextEstimatedTokens > normalizedBudget) {
        units.push({
          file,
          rules: currentRules,
          estimatedTokens: estimateMatchedRuleUnitTokens(file, currentRules, ruleBySource),
        });
        currentRules = [rule];
        continue;
      }

      currentRules = nextRules;
    }

    if (currentRules.length > 0) {
      units.push({
        file,
        rules: currentRules,
        estimatedTokens: estimateMatchedRuleUnitTokens(file, currentRules, ruleBySource),
      });
    }
  }

  return units;
}
