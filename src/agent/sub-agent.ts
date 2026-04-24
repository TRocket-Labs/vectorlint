import type { AgentProgressReporter } from './progress';
import type { AgentToolDefinition, LLMProvider } from '../providers/llm-provider';
import type { TokenUsage } from '../providers/token-usage';
import { buildSubAgentSystemPrompt } from './prompt-builder';

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

  try {
    const result = await provider.runAgentToolLoop({
      systemPrompt: buildSubAgentSystemPrompt({ workspaceRoot, label }),
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
