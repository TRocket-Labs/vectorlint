export interface ComposeSystemPromptParams {
  directive?: string;
  userInstructions?: string;
  instructions: string;
}

export function composeSystemPrompt(params: ComposeSystemPromptParams): string {
  const sections = [
    params.directive?.trim(),
    params.userInstructions?.trim(),
    params.instructions.trim(),
  ].filter((section): section is string => Boolean(section && section.length > 0));

  return sections.join('\n\n');
}
