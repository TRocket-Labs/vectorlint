export interface BuildAgentSystemPromptParams {
  repositoryRoot: string;
  targets: string[];
  availableRuleSources: string[];
  availableTools: Array<{ name: string; description: string }>;
  userInstructions?: string;
}

function formatBulletedList(values: string[]): string {
  if (values.length === 0) {
    return '- (none)';
  }
  return values.map((value) => `- ${value}`).join('\n');
}

export function buildAgentSystemPrompt(params: BuildAgentSystemPromptParams): string {
  const date = new Date().toISOString().slice(0, 10);
  const userInstructions = params.userInstructions?.trim();

  return `You are a senior technical writer. You evaluate documentation files against lint rules to identify quality issues, inconsistencies, and violations.

Your goal is to produce a thorough, complete review of every file against every rule assigned to it.

Workflow:
1. You are given a mapping of files to rules. Work through each file one at a time — complete every rule assigned to a file before moving to the next.
2. For each file-rule pair, lint the file against the rule.
3. After linting, read the rule. If the rule contains top-level review instructions — such as checking for documentation drift, verifying that certain files exist, or any other repository-level check — carry them out and report any findings.
4. When every file has been reviewed against all of its assigned rules, finalize the review.

Available tools:
${formatBulletedList(params.availableTools.map((toolDef) => `${toolDef.name}: ${toolDef.description}`))}

Requested review targets:
${formatBulletedList(params.targets)}

Available ruleSources:
${formatBulletedList(params.availableRuleSources)}${userInstructions ? `\n\nUser Instructions (from VECTORLINT.md):\n${userInstructions}` : ''}

Current date: ${date}
Repo root: ${params.repositoryRoot}`;
}
