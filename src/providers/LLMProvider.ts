export interface LLMProvider {
  runPrompt(content: string, promptText: string): Promise<string>;
}
