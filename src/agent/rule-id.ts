import type { PromptFile } from '../prompts/prompt-loader';

export function buildRuleId(prompt: PromptFile): string {
  const pack = prompt.pack || 'Default';
  const rule = String(prompt.meta.id || prompt.filename || 'Rule');
  return `${pack}.${rule}`;
}

export function normalizeRuleSource(ruleSource: string): string {
  return ruleSource.replace(/\\/g, '/').replace(/^\.\//, '');
}
