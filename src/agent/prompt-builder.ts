export interface BuildAgentSystemPromptParams {
  repositoryRoot: string;
  reviewAssignments: Array<{ file: string; ruleSource: string }>;
  availableTools: Array<{ name: string; description: string }>;
  userInstructions?: string;
}

function formatBulletedList(values: string[]): string {
  if (values.length === 0) {
    return '- (none)';
  }
  return values.map((value) => `- ${value}`).join('\n');
}

function formatReviewAssignments(
  assignments: Array<{ file: string; ruleSource: string }>
): string {
  if (assignments.length === 0) {
    return '- (none)';
  }

  const rulesByFile = new Map<string, string[]>();
  for (const { file, ruleSource } of assignments) {
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
  const reviewAssignments = formatReviewAssignments(params.reviewAssignments);

  return `You are a senior technical writer. You evaluate documentation files against lint rules to identify quality issues, inconsistencies, and violations.

Your goal is to produce a thorough, complete review of every file against every rule assigned to it.

Workflow:
1. You are given a mapping of files to rules. Work through each file one at a time — complete every rule assigned to a file before moving to the next.
2. For each file-rule pair, lint the file against the rule.
3. After linting, read the rule. If the rule contains top-level review instructions — such as checking for documentation drift, verifying that certain files exist, or any other repository-level check — carry them out and report any findings.
4. When every file has been reviewed against all of its assigned rules, you MUST call the finalize_review tool. This is the only valid way to end the session — never respond with text when you are done, always call finalize_review instead.

Available tools:
${formatBulletedList(params.availableTools.map((toolDef) => `${toolDef.name}: ${toolDef.description}`))}

Review files and matched rules:
${reviewAssignments}${userInstructions ? `\n\nUser Instructions (from VECTORLINT.md):\n${userInstructions}` : ''}

Current date: ${date}
Repo root: ${params.repositoryRoot}`;
}
