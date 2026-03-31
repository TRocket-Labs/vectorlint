export interface BuildAgentSystemPromptParams {
  repositoryRoot: string;
  targets: string[];
  availableRuleSources: string[];
  userInstructions?: string;
}

export function buildAgentSystemPrompt(params: BuildAgentSystemPromptParams): string {
  const sections = [
    'You are VectorLint in agent mode.',
    'Use read-only tools for analysis.',
    'You MUST call finalize_review exactly once when done.',
    `Repository root: ${params.repositoryRoot}`,
    `Targets: ${params.targets.join(', ')}`,
    `Available ruleSources: ${params.availableRuleSources.join(', ')}`,
  ];

  const userInstructions = params.userInstructions?.trim();
  if (userInstructions) {
    sections.push('User Instructions');
    sections.push(userInstructions);
  }

  return sections.join('\n');
}
