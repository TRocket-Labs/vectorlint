import type { AgentToolDefinition } from '../providers/llm-provider';
import {
  FINALIZE_REVIEW_INPUT_SCHEMA,
  LINT_TOOL_INPUT_SCHEMA,
  LIST_DIRECTORY_INPUT_SCHEMA,
  READ_FILE_INPUT_SCHEMA,
  SEARCH_CONTENT_INPUT_SCHEMA,
  SEARCH_FILES_INPUT_SCHEMA,
  TOP_LEVEL_REPORT_INPUT_SCHEMA,
} from './types';

export type AgentToolName =
  | 'lint'
  | 'report_finding'
  | 'read_file'
  | 'search_files'
  | 'list_directory'
  | 'search_content'
  | 'finalize_review';

export type AgentToolHandler = (input: unknown) => Promise<unknown>;
export type AgentToolHandlers = Record<AgentToolName, AgentToolHandler>;

export function createAgentTools(params: {
  runTool: (
    toolName: AgentToolName,
    input: unknown,
    handler: AgentToolHandler
  ) => Promise<unknown>;
  handlers: AgentToolHandlers;
}): Record<AgentToolName, AgentToolDefinition> {
  const { runTool, handlers } = params;

  return {
    lint: {
      description: 'Review a file against a source-backed rule, optionally using an override review instruction for that call.',
      inputSchema: LINT_TOOL_INPUT_SCHEMA,
      execute: (input) => runTool('lint', input, handlers.lint),
    },
    report_finding: {
      description: 'Record a top-level finding for the report.',
      inputSchema: TOP_LEVEL_REPORT_INPUT_SCHEMA,
      execute: (input) => runTool('report_finding', input, handlers.report_finding),
    },
    read_file: {
      description: 'Read a file inside the workspace root.',
      inputSchema: READ_FILE_INPUT_SCHEMA,
      execute: (input) => runTool('read_file', input, handlers.read_file),
    },
    search_files: {
      description: 'Find files in the workspace by glob pattern.',
      inputSchema: SEARCH_FILES_INPUT_SCHEMA,
      execute: (input) => runTool('search_files', input, handlers.search_files),
    },
    list_directory: {
      description: 'List files and directories inside a path in the workspace.',
      inputSchema: LIST_DIRECTORY_INPUT_SCHEMA,
      execute: (input) => runTool('list_directory', input, handlers.list_directory),
    },
    search_content: {
      description: 'Search workspace text content by substring and optional glob.',
      inputSchema: SEARCH_CONTENT_INPUT_SCHEMA,
      execute: (input) => runTool('search_content', input, handlers.search_content),
    },
    finalize_review: {
      description: 'REQUIRED: Call this tool when all matched file-rule pairs have been reviewed.',
      inputSchema: FINALIZE_REVIEW_INPUT_SCHEMA,
      execute: (input) => runTool('finalize_review', input, handlers.finalize_review),
    },
  };
}

export function listAvailableTools(
  tools: Record<string, AgentToolDefinition>
): Array<{ name: string; description: string }> {
  return Object.entries(tools).map(([name, definition]) => ({
    name,
    description: definition.description,
  }));
}
