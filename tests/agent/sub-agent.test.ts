import { describe, expect, it } from 'vitest';
import type { LLMProvider } from '../../src/providers/llm-provider';

describe('sub-agent runtime', () => {
  it('runs a sub-agent with read-only tools only', async () => {
    const { runSubAgent } = await import('../../src/agent/sub-agent');

    const provider: LLMProvider = {
      runPromptStructured() {
        throw new Error('not used');
      },
      runAgentToolLoop: async (params: Record<string, unknown>) => {
        const tools = Object.keys((params.tools ?? {}) as Record<string, unknown>).sort();
        expect(tools).toEqual([
          'list_directory',
          'read_file',
          'search_content',
          'search_files',
        ]);
        return { text: 'sub-agent summary', usage: { inputTokens: 2, outputTokens: 1 } };
      },
    } as unknown as LLMProvider;

    const result = await runSubAgent({
      provider,
      task: 'Summarize the workspace',
      workspaceRoot: '/workspace',
      tools: {
        read_file: { description: 'read', inputSchema: {}, execute: async () => ({}) },
        search_files: { description: 'search files', inputSchema: {}, execute: async () => ({}) },
        list_directory: { description: 'list', inputSchema: {}, execute: async () => ({}) },
        search_content: { description: 'search content', inputSchema: {}, execute: async () => ({}) },
      },
    });

    expect(result).toEqual({
      ok: true,
      result: 'sub-agent summary',
      usage: { inputTokens: 2, outputTokens: 1 },
    });
  });

  it('returns a compact error result when the sub-agent loop fails', async () => {
    const { runSubAgent } = await import('../../src/agent/sub-agent');

    const provider: LLMProvider = {
      runPromptStructured() {
        throw new Error('not used');
      },
      runAgentToolLoop: async () => {
        throw new Error('sub-agent failed');
      },
    } as unknown as LLMProvider;

    const result = await runSubAgent({
      provider,
      task: 'Summarize the workspace',
      workspaceRoot: '/workspace',
      tools: {
        read_file: { description: 'read', inputSchema: {}, execute: async () => ({}) },
        search_files: { description: 'search files', inputSchema: {}, execute: async () => ({}) },
        list_directory: { description: 'list', inputSchema: {}, execute: async () => ({}) },
        search_content: { description: 'search content', inputSchema: {}, execute: async () => ({}) },
      },
    });

    expect(result).toEqual({
      ok: false,
      error: 'sub-agent failed',
    });
  });
});
