import { generateText } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import type { PromptFile } from '../schemas/prompt-schemas';
import {
  AgentFindingSchema,
  type AgentRunResult,
} from './types';
import type { ReadFileTool } from './tools/read-file';
import type { SearchContentTool } from './tools/search-content';
import type { SearchFilesTool } from './tools/search-files';
import type { ListDirectoryTool } from './tools/list-directory';
import type { LintTool } from './tools/lint-tool';

export interface AgentTools {
  read_file: ReadFileTool;
  search_content: SearchContentTool;
  search_files: SearchFilesTool;
  list_directory: ListDirectoryTool;
  lint: LintTool;
}

export interface AgentExecutorParams {
  rule: PromptFile;
  cwd: string;
  model: LanguageModel;
  tools: Partial<AgentTools>;
  diffContext: string;
  signal?: AbortSignal;
  userInstructions?: string;
}

const AGENT_OUTPUT_SCHEMA = z.object({
  findings: z.array(AgentFindingSchema),
});

function buildSystemPrompt(
  rule: PromptFile,
  diffContext: string,
  cwd: string,
  userInstructions?: string
): string {
  const date = new Date().toISOString().slice(0, 10);

  const toolDescriptions = `Available tools:
- read_file: Read text file contents with offset/limit pagination
- search_content: Search file contents by regex pattern across multiple files (returns file:line: matchedtext)
- search_files: Find files by glob pattern (e.g. **/*.md, src/**/*.ts)
- list_directory: List directory contents — / suffix on directories, includes dotfiles
- lint: Run per-page VectorLint evaluation on a single file and rule — returns score and violations`;

  const guidelines = `Guidelines:
- Start from changed files in the PR context, then search outward only if the rule requires it
- Use search_content to find patterns across files — do not read every file sequentially
- Use lint for per-page quality checks to keep context lean
- Return findings as soon as you have sufficient evidence
- Report only genuine issues`;

  const outputInstructions = `When complete, return JSON with a "findings" array. Each finding must be:
- inline: { kind: "inline", file, startLine, endLine, message, ruleId, suggestion? }
- top-level: { kind: "top-level", message, ruleId, suggestion?, references?: [{ file, startLine?, endLine? }] }

Return an empty findings array when no issues are found.`;

  const sections = [
    'You are a documentation quality evaluator performing cross-document evaluation.',
    `Rule: ${rule.meta.name} (${rule.meta.id})\n${rule.body}`,
    toolDescriptions,
    guidelines,
  ];

  if (userInstructions) {
    sections.push(`User Instructions (VECTORLINT.md):\n${userInstructions}`);
  }

  if (diffContext) {
    sections.push(`Changed files context:\n${diffContext}`);
  }

  sections.push(outputInstructions);
  sections.push(`Current date: ${date}\nRepo root: ${cwd}`);

  return sections.join('\n\n');
}

export async function runAgentExecutor(params: AgentExecutorParams): Promise<AgentRunResult> {
  const { rule, cwd, model, tools, diffContext, signal, userInstructions } = params;

  const systemPrompt = buildSystemPrompt(rule, diffContext, cwd, userInstructions);

  const sdkTools = {
    ...(tools.read_file && {
      read_file: {
        description: tools.read_file.description,
        parameters: z.object({
          path: z.string(),
          offset: z.number().optional(),
          limit: z.number().optional(),
        }),
        execute: async (args: { path: string; offset?: number; limit?: number }) =>
          tools.read_file?.execute(args),
      },
    }),
    ...(tools.search_content && {
      search_content: {
        description: tools.search_content.description,
        parameters: z.object({
          pattern: z.string(),
          path: z.string().optional(),
          glob: z.string().optional(),
          ignoreCase: z.boolean().optional(),
          context: z.number().optional(),
          limit: z.number().optional(),
        }),
        execute: async (args: {
          pattern: string;
          path?: string;
          glob?: string;
          ignoreCase?: boolean;
          context?: number;
          limit?: number;
        }) => tools.search_content?.execute(args),
      },
    }),
    ...(tools.search_files && {
      search_files: {
        description: tools.search_files.description,
        parameters: z.object({
          pattern: z.string(),
          path: z.string().optional(),
          limit: z.number().optional(),
        }),
        execute: async (args: { pattern: string; path?: string; limit?: number }) =>
          tools.search_files?.execute(args),
      },
    }),
    ...(tools.list_directory && {
      list_directory: {
        description: tools.list_directory.description,
        parameters: z.object({
          path: z.string().optional(),
          limit: z.number().optional(),
        }),
        execute: async (args: { path?: string; limit?: number }) =>
          tools.list_directory?.execute(args),
      },
    }),
    ...(tools.lint && {
      lint: {
        description: tools.lint.description,
        parameters: z.object({
          file: z.string(),
          ruleId: z.string(),
        }),
        execute: async (args: { file: string; ruleId: string }) => tools.lint?.execute(args),
      },
    }),
  };

  try {
    const request = {
      model,
      system: systemPrompt,
      prompt: `Evaluate the documentation according to the rule "${rule.meta.name}".`,
      tools: sdkTools,
      maxSteps: 25,
      abortSignal: signal,
      experimental_output: {
        schema: AGENT_OUTPUT_SCHEMA,
      },
    } as unknown as Parameters<typeof generateText>[0];

    const response = await generateText(request);
    const maybeOutput = response as {
      experimental_output?: unknown;
      output?: unknown;
    };

    const parsed = AGENT_OUTPUT_SCHEMA.safeParse(
      maybeOutput.experimental_output ?? maybeOutput.output
    );

    if (!parsed.success) {
      return { findings: [], ruleId: rule.meta.id };
    }

    return { findings: parsed.data.findings, ruleId: rule.meta.id };
  } catch {
    return { findings: [], ruleId: rule.meta.id };
  }
}
