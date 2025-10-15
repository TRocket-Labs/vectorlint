export interface LLMProvider {
  runPromptStructured<T = unknown>(content: string, promptText: string, schema: { name: string; schema: object }): Promise<T>;
}
