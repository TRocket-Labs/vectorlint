import { describe, expect, it } from 'vitest';
import type { LLMProvider } from '../../src/providers/llm-provider';

describe('sub-agent runtime', () => {
  it('runs a sub-agent with read-only tools only', async () => {
    const { runSubAgent } = await import('../../src/agent/sub-agent');

    const provider: LLMProvider = {
      runPromptStructured() {
        throw new Error('not used');
      },
      runAgentToolLoop(params: Record<string, unknown>) {
        const tools = Object.keys((params.tools ?? {}) as Record<string, unknown>).sort();
        expect(tools).toEqual([
          'list_directory',
          'read_file',
          'search_content',
          'search_files',
        ]);
        return Promise.resolve({
          text: 'sub-agent summary',
          usage: { inputTokens: 2, outputTokens: 1 },
        });
      },
    } as unknown as LLMProvider;

    const result = await runSubAgent({
      provider,
      task: 'Summarize the workspace',
      workspaceRoot: '/workspace',
      tools: {
        read_file: { description: 'read', inputSchema: {}, execute: () => Promise.resolve({}) },
        search_files: {
          description: 'search files',
          inputSchema: {},
          execute: () => Promise.resolve({}),
        },
        list_directory: { description: 'list', inputSchema: {}, execute: () => Promise.resolve({}) },
        search_content: {
          description: 'search content',
          inputSchema: {},
          execute: () => Promise.resolve({}),
        },
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
      runAgentToolLoop() {
        return Promise.reject(new Error('sub-agent failed'));
      },
    } as unknown as LLMProvider;

    const result = await runSubAgent({
      provider,
      task: 'Summarize the workspace',
      workspaceRoot: '/workspace',
      tools: {
        read_file: { description: 'read', inputSchema: {}, execute: () => Promise.resolve({}) },
        search_files: {
          description: 'search files',
          inputSchema: {},
          execute: () => Promise.resolve({}),
        },
        list_directory: { description: 'list', inputSchema: {}, execute: () => Promise.resolve({}) },
        search_content: {
          description: 'search content',
          inputSchema: {},
          execute: () => Promise.resolve({}),
        },
      },
    });

    expect(result).toEqual({
      ok: false,
      error: 'sub-agent failed',
    });
  });
});
