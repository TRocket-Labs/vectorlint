export interface LLMProvider {
  runPrompt(content: string, promptText: string): Promise<string>;
  runPromptStructured<T = unknown>(content: string, promptText: string, schema: any): Promise<T>;
}
