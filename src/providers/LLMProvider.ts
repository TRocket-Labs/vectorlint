export interface LLMProvider {
  runPromptStructured<T = unknown>(content: string, promptText: string, schema: any): Promise<T>;
}
