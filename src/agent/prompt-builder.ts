export interface BuildAgentSystemPromptParams {
  workspaceRoot: string;
  fileRuleMatches: Array<{ file: string; ruleSource: string }>;
  availableTools: Array<{ name: string; description: string }>;
  userInstructions?: string;
}

function formatBulletedList(values: string[]): string {
  if (values.length === 0) {
    return '- (none)';
  }
  return values.map((value) => `- ${value}`).join('\n');
}

function formatFileRuleMatches(
  matches: Array<{ file: string; ruleSource: string }>
): string {
  if (matches.length === 0) {
    return '- (none)';
  }

  const rulesByFile = new Map<string, string[]>();
  for (const { file, ruleSource } of matches) {
    const rules = rulesByFile.get(file) ?? [];
    rules.push(ruleSource);
    rulesByFile.set(file, rules);
  }

  return Array.from(rulesByFile.entries())
    .map(([file, rules]) => `- ${file}\n${rules.map((rule) => `  - ${rule}`).join('\n')}`)
    .join('\n');
}

export function buildAgentSystemPrompt(params: BuildAgentSystemPromptParams): string {
  const date = new Date().toISOString().slice(0, 10);
  const userInstructions = params.userInstructions?.trim();
  const fileRuleMatches = formatFileRuleMatches(params.fileRuleMatches);

  return `You are a senior technical writer. You review documentation files against source-backed rules to identify quality issues, inconsistencies, and violations.

Your goal is to produce a thorough, complete review of every file against every matched rule.

Workflow:
1. You are given matched file-rule pairs. Work through each file one at a time — complete every matched rule for a file before moving to the next.
2. For each file-rule pair, review the file against the rule.
3. After reviewing the file, read the rule. If the rule contains top-level review instructions — such as checking for documentation drift, verifying that certain files exist, or any other workspace-level check — carry them out and report any findings.
4. When every file has been reviewed against all of its matched rules, you MUST call the finalize_review tool.

Available tools:
${formatBulletedList(params.availableTools.map((toolDef) => `${toolDef.name}: ${toolDef.description}`))}

Review files and matched rules:
${fileRuleMatches}${userInstructions ? `\n\nUser Instructions (from VECTORLINT.md):\n${userInstructions}` : ''}

Current date: ${date}
Workspace root: ${params.workspaceRoot}`;
}
