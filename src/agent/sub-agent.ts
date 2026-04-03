import type { AgentProgressReporter } from './progress';
import type { AgentToolDefinition, LLMProvider } from '../providers/llm-provider';
import type { TokenUsage } from '../providers/token-usage';

type ReadOnlySubAgentTools = Record<
  'read_file' | 'search_files' | 'list_directory' | 'search_content',
  AgentToolDefinition
>;

export async function runSubAgent(params: {
  provider: LLMProvider;
  task: string;
  workspaceRoot: string;
  label?: string;
  progressReporter?: AgentProgressReporter;
  tools: ReadOnlySubAgentTools;
}): Promise<
  | { ok: true; result: string; usage?: TokenUsage }
  | { ok: false; error: string; usage?: TokenUsage }
> {
  const { provider, task, workspaceRoot, label, tools } = params;
  const trimmedLabel = label?.trim();

  try {
    const result = await provider.runAgentToolLoop({
      systemPrompt: [
        'You are a bounded sub-agent for workspace analysis.',
        'Use only the provided read-only workspace tools.',
        'Do not perform linting, do not delegate to another agent, and do not write files.',
        'Return a compact final answer only.',
        trimmedLabel ? `Task label: ${trimmedLabel}` : undefined,
        `Workspace root: ${workspaceRoot}`,
      ].filter(Boolean).join('\n'),
      prompt: task,
      tools,
    });

    return {
      ok: true,
      result: result.text?.trim() || '',
      ...(result.usage ? { usage: result.usage } : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: message,
    };
  }
}
