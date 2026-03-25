import { generateText, NoOutputGeneratedError, Output, stepCountIs, tool } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import type { PromptFile } from '../schemas/prompt-schemas.js';
import {
  AGENT_FINDING_SCHEMA,
  type AgentRunResult,
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
  rule: PromptFile;
  cwd: string;
  model: LanguageModel;
  tools: AgentTools;
  diffContext: string;
  signal?: AbortSignal;
  userInstructions?: string;
}

const AGENT_OUTPUT_SCHEMA = z.object({
  findings: z.array(AGENT_FINDING_SCHEMA),
});
const MAX_AGENT_STEPS = 25;

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
  rule: PromptFile,
  diffContext: string,
  cwd: string,
  userInstructions?: string,
): string {
  const date = new Date().toISOString().slice(0, 10);

  const toolDescriptions = `Available tools:
- read_file: Read text file contents with offset/limit pagination
- search_content: Search file contents by regex pattern across multiple files (returns file:line: matchedtext)
- search_files: Find files by glob pattern (e.g. **/*.md, src/**/*.ts)
- list_directory: List directory contents; directories use / suffix and dotfiles are included
- lint: Run per-page VectorLint evaluation on a single file and rule; returns score and violations`;

  const guidelines = `Guidelines:
- Start from changed files in the provided PR context, then expand only when the rule requires it
- Use search_content to find patterns across files; avoid reading every file sequentially
- Use lint for per-page quality checks to keep context compact
- Return findings immediately when evidence is sufficient
- Report only genuine problems
- Include exact file paths and line numbers for every inline finding`;

  const outputInstructions = `Return a JSON object with a "findings" array:
- inline finding: { kind: "inline", file, startLine, endLine, message, ruleId, suggestion? }
- top-level finding: { kind: "top-level", message, ruleId, suggestion?, references?: [{ file, startLine?, endLine? }] }
If no issues exist, return "findings": []`;

  const sections = [
    'You are a senior technical writer evaluating documentation quality. Use lint for per-page checks and file tools for cross-file evidence.',
    `Rule: ${rule.meta.name} (${rule.meta.id})\n${rule.body}`,
    toolDescriptions,
    guidelines,
  ];

  if (userInstructions) {
    sections.push(`User Instructions (from VECTORLINT.md):\n${userInstructions}`);
  }

  if (diffContext) {
    sections.push(`Context — what changed in this PR:\n${diffContext}`);
  }

  sections.push(outputInstructions);
  sections.push(`Current date: ${date}\nRepo root: ${cwd}`);

  return sections.join('\n\n');
}

export async function runAgentExecutor(params: AgentExecutorParams): Promise<AgentRunResult> {
  const { rule, cwd, model, tools, diffContext, signal, userInstructions } = params;
  const systemPrompt = buildSystemPrompt(rule, diffContext, cwd, userInstructions);
  let responseText = '';

  const sdkTools = {
    read_file: tool({
      description: tools.read_file.description,
      inputSchema: z.object({
        path: z.string().describe('File path relative to repo root'),
        offset: z.number().optional().describe('Line number to start reading from (1-indexed)'),
        limit: z.number().optional().describe('Maximum number of lines to read'),
      }),
      execute: async (args) => tools.read_file.execute(args),
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
      execute: async (args) => tools.search_content.execute(args),
    }),
    search_files: tool({
      description: tools.search_files.description,
      inputSchema: z.object({
        pattern: z.string().describe('Glob pattern, e.g. **/*.md'),
        path: z.string().optional().describe('Directory to search'),
        limit: z.number().optional(),
      }),
      execute: async (args) => tools.search_files.execute(args),
    }),
    list_directory: tool({
      description: tools.list_directory.description,
      inputSchema: z.object({
        path: z.string().optional().describe('Directory path (default: repo root)'),
        limit: z.number().optional(),
      }),
      execute: async (args) => tools.list_directory.execute(args),
    }),
    lint: tool({
      description: tools.lint.description,
      inputSchema: z.object({
        file: z.string().describe('File path to lint'),
        ruleId: z.string().describe('Rule ID from frontmatter id'),
      }),
      execute: async (args) => tools.lint.execute(args),
    }),
  };

  try {
    const response = await generateText({
      model,
      system: systemPrompt,
      prompt: `Evaluate documentation against rule "${rule.meta.name}". Return findings as JSON.`,
      tools: sdkTools,
      stopWhen: stepCountIs(MAX_AGENT_STEPS),
      abortSignal: signal,
      output: Output.object({ schema: AGENT_OUTPUT_SCHEMA }),
    });
    responseText = response.text;

    return {
      findings: response.output.findings,
      ruleId: rule.meta.id,
    };
  } catch (error) {
    if (NoOutputGeneratedError.isInstance(error)) {
      const fallbackOutput = parseAgentOutputFromText(responseText);
      if (fallbackOutput) {
        return {
          findings: fallbackOutput.findings,
          ruleId: rule.meta.id,
        };
      }
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      findings: [],
      ruleId: rule.meta.id,
      error: `Agent execution failed: ${message}`,
    };
  }
}
