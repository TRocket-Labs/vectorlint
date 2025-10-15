export interface LLMProvider {
  runPromptStructured<T = unknown>(content: string, promptText: string, schema: { name: string; schema: Record<string, unknown> }): Promise<T>;
}
