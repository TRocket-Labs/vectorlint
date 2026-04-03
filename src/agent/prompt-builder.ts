import type { MatchedRuleUnit } from './rule-units';

export interface BuildAgentSystemPromptParams {
  workspaceRoot: string;
  matchedRuleUnits: MatchedRuleUnit[];
  availableTools: Array<{ name: string; description: string }>;
  userInstructions?: string;
}

function formatBulletedList(values: string[]): string {
  if (values.length === 0) {
    return '- (none)';
  }
  return values.map((value) => `- ${value}`).join('\n');
}

function formatMatchedRuleUnits(
  matchedRuleUnits: MatchedRuleUnit[]
): string {
  if (matchedRuleUnits.length === 0) {
    return '- (none)';
  }

  const unitsByFile = new Map<string, MatchedRuleUnit[]>();
  for (const matchedRuleUnit of matchedRuleUnits) {
    const units = unitsByFile.get(matchedRuleUnit.file) ?? [];
    units.push(matchedRuleUnit);
    unitsByFile.set(matchedRuleUnit.file, units);
  }

  return Array.from(unitsByFile.entries())
    .map(([file, units]) => {
      const renderedUnits = units
        .map((unit) => `  - Matched Rule Unit:\n${unit.rules.map((rule) => `    - ${rule.ruleSource}`).join('\n')}`)
        .join('\n');
      return `- ${file}\n${renderedUnits}`;
    })
    .join('\n');
}

export function buildAgentSystemPrompt(params: BuildAgentSystemPromptParams): string {
  const date = new Date().toISOString().slice(0, 10);
  const userInstructions = params.userInstructions?.trim();
  const matchedRuleUnits = formatMatchedRuleUnits(params.matchedRuleUnits);

  return `You are a senior technical writer. You review documentation files against source-backed rules to identify quality issues, inconsistencies, and violations.

Your goal is to produce a thorough, complete review of every file against every matched rule.

Workflow:
1. You are given matched rule units. Work through each file one at a time — complete every matched rule unit for a file before moving to the next.
2. For each matched rule unit, review the file against every rule in that unit.
3. After reviewing the file, read each rule in the current unit. If a rule contains top-level review instructions — such as checking for documentation drift, verifying that certain files exist, or any other workspace-level check — carry them out and report any findings.
4. When every file has been reviewed against all of its matched rules, you MUST call the finalize_review tool.

Available tools:
${formatBulletedList(params.availableTools.map((toolDef) => `${toolDef.name}: ${toolDef.description}`))}

Review files and Matched Rule Units:
${matchedRuleUnits}${userInstructions ? `\n\nUser Instructions (from VECTORLINT.md):\n${userInstructions}` : ''}

Current date: ${date}
Workspace root: ${params.workspaceRoot}`;
}
