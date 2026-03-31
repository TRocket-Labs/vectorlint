export interface BuildAgentSystemPromptParams {
  repositoryRoot: string;
  targets: string[];
  availableRuleSources: string[];
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
      '- Record every confirmed issue with report_finding.',
      '- You MUST call finalize_review exactly once when done.',
    ].join('\n'),
    [
      'Available tools:',
      '- read_file: Read text file contents with optional pagination.',
      '- search_content: Search text content in files by substring pattern.',
      '- search_files: Find files by glob pattern.',
      '- list_directory: List files and directories under a path.',
      '- lint: Run one configured ruleSource against a single file.',
      '- report_finding: Persist one finding into the review session.',
      '- finalize_review: Close the run. Must be called exactly once.',
    ].join('\n'),
    [
      'Finding contract:',
      '- Submit each finding with report_finding as soon as evidence is sufficient.',
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
