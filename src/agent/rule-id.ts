import type { RuleFile } from '../rules/rule-loader';

export function buildRuleId(rule: RuleFile): string {
  const pack = rule.pack || 'Default';
  const ruleId = String(rule.meta.id || rule.filename || 'Rule');
  return `${pack}.${ruleId}`;
}

export function normalizeRuleSource(ruleSource: string): string {
  return ruleSource.replace(/\\/g, '/').replace(/^\.\//, '');
}
