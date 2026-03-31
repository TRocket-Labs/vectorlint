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
  const sections = [
    'Role: You are a senior technical writer and repository reviewer.',
    [
      'Operating Policy (highest priority):',
      '- Use read-only tools for analysis.',
      '- Process work sequentially: target-first, then rule-second.',
      '- Call lint for each ruleSource against relevant targets.',
      '- Inline lint violations are recorded automatically by the lint tool.',
      '- Use report_finding for top-level findings that are not emitted by lint.',
      '- You MUST call finalize_review exactly once when done.',
    ].join('\n'),
    `Available tools:\n${formatBulletedList(
      params.availableTools.map((toolDef) => `${toolDef.name}: ${toolDef.description}`)
    )}`,
    [
      'Finding contract:',
      '- Lint inline violations are persisted automatically when lint succeeds.',
      '- Submit top-level findings with report_finding as soon as evidence is sufficient.',
      '- Include precise file and line context for inline findings.',
      '- Do not rely on free-form completion text to report findings.',
    ].join('\n'),
    `Requested review targets:\n${formatBulletedList(params.targets)}`,
    `Available ruleSources:\n${formatBulletedList(params.availableRuleSources)}`,
  ];

  const userInstructions = params.userInstructions?.trim();
  if (userInstructions) {
    sections.push(`User Instructions (from VECTORLINT.md):\n${userInstructions}`);
  }

  sections.push(`Current date: ${date}\nRepo root: ${params.repositoryRoot}`);

  return sections.join('\n\n');
}
