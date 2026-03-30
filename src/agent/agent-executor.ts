import { generateText, NoOutputGeneratedError, Output, stepCountIs, tool } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import * as path from 'node:path';
import type { PromptFile } from '../schemas/prompt-schemas.js';
import {
  AGENT_FINDING_SCHEMA,
  type AgentRunResult,
  type AgentFileRuleMapEntry,
} from './types.js';
import type { ReadFileTool } from './tools/read-file.js';
import type { SearchContentTool } from './tools/search-content.js';
import type { SearchFilesTool } from './tools/search-files.js';
import type { ListDirectoryTool } from './tools/list-directory.js';
import type { LintTool } from './tools/lint-tool.js';

export interface AgentTools {
  read_file: ReadFileTool;
  search_content: SearchContentTool;
  search_files: SearchFilesTool;
  list_directory: ListDirectoryTool;
  lint: LintTool;
}

export interface AgentExecutorParams {
  requestedTargets: string[];
  fileRuleMap: AgentFileRuleMapEntry[];
  cwd: string;
  model: LanguageModel;
  tools: AgentTools;
  signal?: AbortSignal;
  userInstructions?: string;
  maxParallelToolCalls?: number;
  maxRetries?: number;
  onStatus?: (event: AgentStatusEvent) => void;
}

export interface AgentStatusEvent {
  type: 'step-start' | 'tool-start' | 'tool-finish';
  stepNumber: number;
  toolName?: string;
  toolArgs?: unknown;
  success?: boolean;
}

const AGENT_OUTPUT_SCHEMA = z.object({
  findings: z.array(AGENT_FINDING_SCHEMA),
});
const MAX_AGENT_STEPS = 25;
const DEFAULT_AGENT_MAX_RETRIES = 5;
const DEFAULT_AGENT_TOOL_CONCURRENCY = 1;

function parseAgentOutputFromText(text: string): z.infer<typeof AGENT_OUTPUT_SCHEMA> | null {
  const candidates: string[] = [];
  const trimmed = text.trim();
  if (trimmed) candidates.push(trimmed);

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const fencedContent = fencedMatch?.[1]?.trim();
  if (fencedContent) candidates.push(fencedContent);

  const objectStart = text.indexOf('{');
  const objectEnd = text.lastIndexOf('}');
  if (objectStart !== -1 && objectEnd > objectStart) {
    candidates.push(text.slice(objectStart, objectEnd + 1).trim());
  }

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      return AGENT_OUTPUT_SCHEMA.parse(parsed);
    } catch {
      // Continue trying alternative candidate payloads.
    }
  }

  return null;
}

function buildSystemPrompt(
  requestedTargets: string[],
  fileRuleMap: AgentFileRuleMapEntry[],
  cwd: string,
  userInstructions?: string,
): string {
  const date = new Date().toISOString().slice(0, 10);

  const toolDescriptions = `Available tools:
- read_file: Read text file contents with offset/limit pagination
- search_content: Search file contents by regex pattern across multiple files (returns file:line: matchedtext)
- search_files: Find files by glob pattern (e.g. **/*.md, src/**/*.ts)
- list_directory: List directory contents; directories use / suffix and dotfiles are included
- lint: Run structured prose evaluation on one file. Pass ruleId + ruleContent (rule body only, no YAML frontmatter). Pass optional context (external evidence you gathered) when needed. Do not use lint for structural checks such as file existence or missing sections`;

  const operatingPolicy = `Operating Policy (highest priority):
- Process work sequentially: file-first, then rule-second
- For each file, apply only the rules mapped to that file
- Use lint for writing-quality checks (clarity, correctness, consistency) on page content
- Use file tools for structural checks (missing files, broken links, missing sections)
- For mixed rules, strip structural criteria from ruleContent before calling lint
- Use search_content to find patterns across files; avoid reading every file sequentially
- Return findings immediately when evidence is sufficient
- Report only genuine problems
- Include exact file paths and line numbers for every inline finding`;

  const outputInstructions = `Return a JSON object with a "findings" array:
- inline finding: { kind: "inline", file, startLine, endLine, message, ruleId, suggestion? }
- top-level finding: { kind: "top-level", message, ruleId, suggestion?, references?: [{ file, startLine?, endLine? }] }
If no issues exist, return "findings": []`;

  const uniqueRules = new Map<string, PromptFile>();
  for (const entry of fileRuleMap) {
    for (const rule of entry.rules) {
      uniqueRules.set(rule.meta.id, rule);
    }
  }

  const fileRuleMapText = fileRuleMap.length > 0
    ? fileRuleMap
      .map((entry) => {
        const file = toRepoRelativePath(entry.file, cwd);
        const ruleIds = entry.rules.map((rule) => rule.meta.id).join(', ');
        return `- ${file} => ${ruleIds || '(none)'}`;
      })
      .join('\n')
    : '- (none)';

  const rulesCatalogText = uniqueRules.size > 0
    ? Array.from(uniqueRules.values())
      .map((rule) => {
        const body = rule.body.trim();
        return `- ${rule.meta.id} (${rule.meta.name || rule.meta.id}):\n${body}`;
      })
      .join('\n\n')
    : '- (none)';

  const sections = [
    'Role: You are a senior technical writer and repository reviewer.',
    operatingPolicy,
    toolDescriptions,
    `Requested review targets:\n${requestedTargets.length > 0 ? formatPromptFileList(requestedTargets, cwd) : '- (none)'}`,
    `File-rule map:\n${fileRuleMapText}`,
    `Rules catalog:\n${rulesCatalogText}`,
  ];

  if (userInstructions) {
    sections.push(`User Instructions (from VECTORLINT.md):\n${userInstructions}`);
  }

  sections.push(outputInstructions);
  sections.push(`Current date: ${date}\nRepo root: ${cwd}`);

  return sections.join('\n\n');
}

function formatPromptFileList(files: string[], cwd: string): string {
  return files
    .map((file) => (path.isAbsolute(file) ? path.relative(cwd, file) || file : file))
    .map((file) => `- ${file}`)
    .join('\n');
}

function toRepoRelativePath(filePath: string, cwd: string): string {
  if (!path.isAbsolute(filePath)) return filePath;
  return path.relative(cwd, filePath) || filePath;
}

function createConcurrencyLimiter(limit: number): <T>(operation: () => Promise<T>) => Promise<T> {
  let active = 0;
  const queue: Array<() => void> = [];

  const scheduleNext = () => {
    if (active >= limit) return;
    const next = queue.shift();
    if (!next) return;
    active += 1;
    next();
  };

  return async <T>(operation: () => Promise<T>): Promise<T> => {
    await new Promise<void>((resolve) => {
      queue.push(resolve);
      scheduleNext();
    });

    try {
      return await operation();
    } finally {
      active -= 1;
      scheduleNext();
    }
  };
}

function buildProviderOptions(): Record<string, unknown> | undefined {
  const provider = (process.env.LLM_PROVIDER || '').toLowerCase();
  if (provider === 'anthropic') {
    return { anthropic: { disableParallelToolUse: true } };
  }
  if (provider === 'openai' || provider === 'azure-openai') {
    return { openai: { parallelToolCalls: false } };
  }
  return undefined;
}

export async function runAgentExecutor(params: AgentExecutorParams): Promise<AgentRunResult> {
  const {
    requestedTargets = [],
    fileRuleMap = [],
    cwd,
    model,
    tools,
    signal,
    userInstructions,
    maxParallelToolCalls = DEFAULT_AGENT_TOOL_CONCURRENCY,
    maxRetries = DEFAULT_AGENT_MAX_RETRIES,
    onStatus,
  } = params;
  if (fileRuleMap.length === 0 || fileRuleMap.every((entry) => entry.rules.length === 0)) {
    return {
      findings: [],
      ruleId: 'agent',
    };
  }

  const systemPrompt = buildSystemPrompt(requestedTargets, fileRuleMap, cwd, userInstructions);
  const providerOptions = buildProviderOptions();
  const runToolWithLimit = createConcurrencyLimiter(
    Math.max(1, Math.floor(maxParallelToolCalls)),
  );
  let responseText = '';

  const sdkTools = {
    read_file: tool({
      description: tools.read_file.description,
      inputSchema: z.object({
        path: z.string().describe('File path relative to repo root'),
        offset: z.number().optional().describe('Line number to start reading from (1-indexed)'),
        limit: z.number().optional().describe('Maximum number of lines to read'),
      }),
      execute: async (args) => runToolWithLimit(() => tools.read_file.execute(args)),
    }),
    search_content: tool({
      description: tools.search_content.description,
      inputSchema: z.object({
        pattern: z.string().describe('Search pattern (regex or literal)'),
        path: z.string().optional().describe('Directory to search (default: repo root)'),
        glob: z.string().optional().describe('File glob filter (default: **/*.md)'),
        ignoreCase: z.boolean().optional().describe('Case-insensitive search'),
        context: z.number().optional().describe('Number of context lines around matches'),
        limit: z.number().optional().describe('Max matches to return'),
      }),
      execute: async (args) => runToolWithLimit(() => tools.search_content.execute(args)),
    }),
    search_files: tool({
      description: tools.search_files.description,
      inputSchema: z.object({
        pattern: z.string().describe('Glob pattern, e.g. **/*.md'),
        path: z.string().optional().describe('Directory to search'),
        limit: z.number().optional(),
      }),
      execute: async (args) => runToolWithLimit(() => tools.search_files.execute(args)),
    }),
    list_directory: tool({
      description: tools.list_directory.description,
      inputSchema: z.object({
        path: z.string().optional().describe('Directory path (default: repo root)'),
        limit: z.number().optional(),
      }),
      execute: async (args) => runToolWithLimit(() => tools.list_directory.execute(args)),
    }),
    lint: tool({
      description: tools.lint.description,
      inputSchema: z.object({
        file: z.string().describe('File path to lint'),
        ruleId: z.string().describe('Rule ID from the rules catalog'),
        ruleContent: z.string().describe('Rule criteria body only (no YAML frontmatter)'),
        context: z.string().optional().describe('Optional external evidence to ground evaluation'),
      }),
      execute: async (args) => runToolWithLimit(() => tools.lint.execute(args)),
    }),
  };

  try {
    const response = await generateText({
      model,
      system: systemPrompt,
      prompt: 'Review the requested targets using the file-rule map and rules catalog. Process files sequentially and apply each mapped rule before moving to the next file. Return findings as JSON.',
      tools: sdkTools,
      stopWhen: stepCountIs(MAX_AGENT_STEPS),
      abortSignal: signal,
      maxRetries,
      ...(providerOptions ? { providerOptions } : {}),
      experimental_onStepStart: ({ stepNumber }) => {
        onStatus?.({ type: 'step-start', stepNumber });
      },
      experimental_onToolCallStart: ({ stepNumber, toolCall }) => {
        const toolArgs = (toolCall as { input?: unknown; args?: unknown }).input
          ?? (toolCall as { input?: unknown; args?: unknown }).args;
        onStatus?.({
          type: 'tool-start',
          stepNumber: stepNumber ?? 0,
          toolName: toolCall.toolName,
          toolArgs,
        });
      },
      experimental_onToolCallFinish: ({ stepNumber, toolCall, success }) => {
        const toolArgs = (toolCall as { input?: unknown; args?: unknown }).input
          ?? (toolCall as { input?: unknown; args?: unknown }).args;
        onStatus?.({
          type: 'tool-finish',
          stepNumber: stepNumber ?? 0,
          toolName: toolCall.toolName,
          toolArgs,
          success,
        });
      },
      output: Output.object({ schema: AGENT_OUTPUT_SCHEMA }),
    });
    responseText = response.text;

    return {
      findings: response.output.findings,
      ruleId: 'agent',
    };
  } catch (error) {
    if (NoOutputGeneratedError.isInstance(error)) {
      const fallbackOutput = parseAgentOutputFromText(responseText);
      if (fallbackOutput) {
        return {
          findings: fallbackOutput.findings,
          ruleId: 'agent',
        };
      }
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      findings: [],
      ruleId: 'agent',
      error: `Agent execution failed: ${message}`,
    };
  }
}
