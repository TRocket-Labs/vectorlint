import { readdir, readFile } from 'fs/promises';
import * as os from 'os';
import fg from 'fast-glob';
import { buildCheckLLMSchema, isJudgeResult, type PromptEvaluationResult } from '../prompts/schema';
import type { PromptFile } from '../prompts/prompt-loader';
import { Type, Severity } from '../evaluators/types';
import { computeFilterDecision } from '../evaluators/violation-filter';
import { locateQuotedText } from '../output/location';
import type { AgentToolDefinition, AgentToolLoopResult, LLMProvider } from '../providers/llm-provider';
import type { OutputFormat } from '../cli/types';
import { createEvaluator } from '../evaluators';
import { createReviewSessionStore } from './review-session-store';
import { buildAgentSystemPrompt } from './prompt-builder';
import {
  FINALIZE_REVIEW_INPUT_SCHEMA,
  LINT_TOOL_INPUT_SCHEMA,
  LIST_DIRECTORY_INPUT_SCHEMA,
  READ_FILE_INPUT_SCHEMA,
  SEARCH_CONTENT_INPUT_SCHEMA,
  SEARCH_FILES_INPUT_SCHEMA,
  TOP_LEVEL_REPORT_INPUT_SCHEMA,
  type SessionEvent,
} from './types';
import { resolveGlobPatternWithinRoot, resolveWithinRoot, toRelativePathFromRoot } from './path-utils';
import type { AgentProgressReporter } from './progress';

type ToolHandler = (input: unknown) => Promise<unknown>;

export interface AgentFinding {
  file: string;
  line: number;
  column: number;
  severity: Severity;
  message: string;
  ruleId: string;
  ruleSource: string;
  analysis?: string;
  suggestion?: string;
  fix?: string;
  match?: string;
}

export interface RunAgentExecutorParams {
  targets: string[];
  prompts: PromptFile[];
  provider: LLMProvider;
  repositoryRoot: string;
  scanPaths: Array<{ pattern: string; runRules: string[]; overrides: Record<string, string> }>;
  outputFormat: OutputFormat;
  printMode: boolean;
  sessionHomeDir?: string;
  progressReporter?: AgentProgressReporter;
  maxSteps?: number;
  maxRetries?: number;
  maxParallelToolCalls?: number;
}

export interface AgentExecutorResult {
  findings: AgentFinding[];
  events: SessionEvent[];
  hadOperationalErrors: boolean;
  errorMessage?: string;
  usage?: AgentToolLoopResult['usage'];
}

function normalizeRuleSource(ruleSource: string): string {
  return ruleSource.replace(/\\/g, '/').replace(/^\.\//, '');
}

function buildRuleId(prompt: PromptFile): string {
  const pack = prompt.pack || 'Default';
  const rule = String(prompt.meta.id || prompt.filename || 'Rule');
  return `${pack}.${rule}`;
}

function buildUnknownRuleSourceError(ruleSource: string, validSources: string[]): Error {
  const validHint = validSources.length > 0 ? validSources.join(', ') : '(none)';
  return new Error(`Unknown ruleSource "${ruleSource}". Valid sources: ${validHint}`);
}

function fallbackMessage(result: PromptEvaluationResult): string {
  if (!isJudgeResult(result) && result.reasoning) {
    return result.reasoning;
  }
  return 'Potential issue detected';
}

function severityFromPrompt(prompt: PromptFile): Severity {
  return prompt.meta.severity === Severity.ERROR ? Severity.ERROR : Severity.WARNING;
}

function resolvePromptBySource(
  ruleSource: string,
  promptBySource: Map<string, PromptFile>
): PromptFile | undefined {
  const normalized = normalizeRuleSource(ruleSource);
  return promptBySource.get(normalized);
}

function resolveTargetForTopLevel(
  repositoryRoot: string,
  targets: string[],
  file?: string
): string {
  if (file && file.trim().length > 0) {
    const resolved = resolveWithinRoot(repositoryRoot, file);
    return toRelativePathFromRoot(repositoryRoot, resolved);
  }
  if (targets.length > 0) {
    return toRelativePathFromRoot(repositoryRoot, targets[0]!);
  }
  return '.';
}

function findingsFromEvents(events: SessionEvent[]): AgentFinding[] {
  const findings: AgentFinding[] = [];

  for (const event of events) {
    if (event.eventType !== 'finding_recorded_inline' && event.eventType !== 'finding_recorded_top_level') {
      continue;
    }

    const payload = event.payload;
    const file = payload.file ?? '.';
    const line = payload.line ?? 1;
    findings.push({
      file,
      line,
      column: payload.column ?? 1,
      severity: payload.severity === Severity.ERROR ? Severity.ERROR : Severity.WARNING,
      message: payload.message,
      ruleId: payload.ruleId ?? payload.ruleSource,
      ruleSource: payload.ruleSource,
      ...('analysis' in payload && payload.analysis ? { analysis: payload.analysis } : {}),
      ...('suggestion' in payload && payload.suggestion ? { suggestion: payload.suggestion } : {}),
      ...('fix' in payload && payload.fix ? { fix: payload.fix } : {}),
      ...('match' in payload && payload.match ? { match: payload.match } : {}),
    });
  }

  return findings;
}

export async function runAgentExecutor(params: RunAgentExecutorParams): Promise<AgentExecutorResult> {
  const {
    targets,
    prompts,
    provider,
    repositoryRoot,
    sessionHomeDir = os.homedir(),
    progressReporter,
    maxSteps,
    maxRetries,
    maxParallelToolCalls,
  } = params;

  const promptBySource = new Map<string, PromptFile>();
  for (const prompt of prompts) {
    promptBySource.set(normalizeRuleSource(prompt.fullPath), prompt);
  }
  const validSources = Array.from(promptBySource.keys()).sort();

  const store = await createReviewSessionStore({ homeDir: sessionHomeDir });
  const findingsBuffer: AgentFinding[] = [];
  const relativeTargets = targets.map((target) =>
    toRelativePathFromRoot(repositoryRoot, resolveWithinRoot(repositoryRoot, target))
  );
  const defaultRuleName = String(prompts[0]?.meta.name || prompts[0]?.meta.id || 'Rule');

  if (relativeTargets.length > 0) {
    progressReporter?.startFile(relativeTargets[0]!, defaultRuleName);
  }

  await store.append({
    eventType: 'session_started',
    payload: {
      cwd: repositoryRoot,
      targets: relativeTargets,
    },
  });

  let finalized = false;

  async function runTool(toolName: string, input: unknown, handler: ToolHandler): Promise<unknown> {
    await store.append({
      eventType: 'tool_call_started',
      payload: { toolName, input },
    });
    progressReporter?.toolCallStarted(toolName);

    try {
      const output = await handler(input);
      await store.append({
        eventType: 'tool_call_finished',
        payload: {
          toolName,
          ok: true,
          output,
        },
      });
      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await store.append({
        eventType: 'tool_call_finished',
        payload: {
          toolName,
          ok: false,
          error: message,
        },
      });
      throw error;
    }
  }

  async function lintToolHandler(input: unknown): Promise<unknown> {
    const parsed = LINT_TOOL_INPUT_SCHEMA.parse(input);
    const prompt = resolvePromptBySource(parsed.ruleSource, promptBySource);
    if (!prompt) {
      throw buildUnknownRuleSourceError(parsed.ruleSource, validSources);
    }

    const absoluteFile = resolveWithinRoot(repositoryRoot, parsed.file);
    const relFile = toRelativePathFromRoot(repositoryRoot, absoluteFile);
    const content = await readFile(absoluteFile, 'utf8');

    const evaluator = createEvaluator(
      resolveEvaluatorType(prompt.meta.evaluator),
      provider,
      prompt
    );
    const result = await evaluator.evaluate(relFile, content);

    let findingsRecorded = 0;
    if (!isJudgeResult(result)) {
      for (const violation of result.violations) {
        const filterDecision = computeFilterDecision(violation);
        if (!filterDecision.surface) {
          continue;
        }

        const location = locateQuotedText(
          content,
          {
            quoted_text: violation.quoted_text || '',
            context_before: violation.context_before || '',
            context_after: violation.context_after || '',
          },
          80,
          violation.line
        );

        const line = location?.line ?? Math.max(1, Math.trunc(violation.line ?? 1));
        const column = location?.column ?? 1;
        const match = location?.match ?? violation.quoted_text ?? '';
        const message = (violation.message || violation.description || fallbackMessage(result)).trim();

        const finding: AgentFinding = {
          file: relFile,
          line,
          column,
          severity: severityFromPrompt(prompt),
          message,
          ruleId: buildRuleId(prompt),
          ruleSource: normalizeRuleSource(parsed.ruleSource),
          ...(violation.analysis ? { analysis: violation.analysis } : {}),
          ...(violation.suggestion ? { suggestion: violation.suggestion } : {}),
          ...(violation.fix ? { fix: violation.fix } : {}),
          ...(match ? { match } : {}),
        };

        findingsBuffer.push(finding);
        findingsRecorded += 1;
        await store.append({
          eventType: 'finding_recorded_inline',
          payload: {
            file: finding.file,
            line: finding.line,
            column: finding.column,
            severity: finding.severity,
            ruleId: finding.ruleId,
            ruleSource: finding.ruleSource,
            message: finding.message,
            ...(finding.analysis ? { analysis: finding.analysis } : {}),
            ...(finding.suggestion ? { suggestion: finding.suggestion } : {}),
            ...(finding.fix ? { fix: finding.fix } : {}),
            ...(finding.match ? { match: finding.match } : {}),
          },
        });
      }
    }

    return {
      ok: true,
      findingsRecorded,
      schema: buildCheckLLMSchema().name,
    };
  }

  async function reportFindingToolHandler(input: unknown): Promise<unknown> {
    const parsed = TOP_LEVEL_REPORT_INPUT_SCHEMA.parse(input);
    const prompt = resolvePromptBySource(parsed.ruleSource, promptBySource);
    if (!prompt) {
      throw buildUnknownRuleSourceError(parsed.ruleSource, validSources);
    }

    const references = parsed.references && parsed.references.length > 0
      ? parsed.references
      : [{ file: resolveTargetForTopLevel(repositoryRoot, targets), startLine: 1, endLine: 1 }];

    let findingsRecorded = 0;
    for (const reference of references) {
      const relFile = resolveTargetForTopLevel(repositoryRoot, targets, reference.file);
      const finding: AgentFinding = {
        file: relFile,
        line: Math.max(1, Math.trunc(reference.startLine)),
        column: 1,
        severity: severityFromPrompt(prompt),
        message: parsed.message,
        ruleId: buildRuleId(prompt),
        ruleSource: normalizeRuleSource(parsed.ruleSource),
        ...(parsed.suggestion ? { suggestion: parsed.suggestion } : {}),
      };

      findingsBuffer.push(finding);
      findingsRecorded += 1;
      await store.append({
        eventType: 'finding_recorded_top_level',
        payload: {
          file: finding.file,
          line: finding.line,
          column: finding.column,
          severity: finding.severity,
          ruleId: finding.ruleId,
          ruleSource: finding.ruleSource,
          message: finding.message,
          ...(finding.suggestion ? { suggestion: finding.suggestion } : {}),
          ...(parsed.references ? { references: parsed.references } : {}),
        },
      });
    }

    return { ok: true, findingsRecorded };
  }

  async function readFileToolHandler(input: unknown): Promise<unknown> {
    const parsed = READ_FILE_INPUT_SCHEMA.parse(input);
    const absolutePath = resolveWithinRoot(repositoryRoot, parsed.path);
    const content = await readFile(absolutePath, 'utf8');
    return {
      path: toRelativePathFromRoot(repositoryRoot, absolutePath),
      content,
    };
  }

  async function searchFilesToolHandler(input: unknown): Promise<unknown> {
    const parsed = SEARCH_FILES_INPUT_SCHEMA.parse(input);
    const scope = resolveGlobPatternWithinRoot(repositoryRoot, parsed.pattern);
    const matches = await fg(scope.pattern, {
      cwd: scope.cwd,
      dot: false,
      onlyFiles: true,
      absolute: true,
    });

    return {
      matches: matches
        .map((match) => toRelativePathFromRoot(repositoryRoot, match))
        .sort((a, b) => a.localeCompare(b)),
    };
  }

  async function listDirectoryToolHandler(input: unknown): Promise<unknown> {
    const parsed = LIST_DIRECTORY_INPUT_SCHEMA.parse(input);
    const absolutePath = resolveWithinRoot(repositoryRoot, parsed.path);
    const entries = await readdir(absolutePath, { withFileTypes: true });

    return {
      path: toRelativePathFromRoot(repositoryRoot, absolutePath),
      entries: entries
        .map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    };
  }

  async function searchContentToolHandler(input: unknown): Promise<unknown> {
    const parsed = SEARCH_CONTENT_INPUT_SCHEMA.parse(input);
    const absoluteSearchRoot = resolveWithinRoot(repositoryRoot, parsed.path || '.');
    const globScope = resolveGlobPatternWithinRoot(absoluteSearchRoot, parsed.glob || '**/*');
    const files = await fg(globScope.pattern, {
      cwd: globScope.cwd,
      dot: false,
      onlyFiles: true,
      absolute: true,
    });

    const matches: Array<{ file: string; line: number; text: string }> = [];
    for (const filePath of files) {
      let content = '';
      try {
        content = await readFile(filePath, 'utf8');
      } catch {
        continue;
      }

      const lines = content.split('\n');
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]!;
        if (line.includes(parsed.pattern)) {
          matches.push({
            file: toRelativePathFromRoot(repositoryRoot, filePath),
            line: index + 1,
            text: line,
          });
        }
      }
    }

    return { matches };
  }

  async function finalizeReviewToolHandler(input: unknown): Promise<unknown> {
    const parsed = FINALIZE_REVIEW_INPUT_SCHEMA.parse(input);
    if (finalized) {
      throw new Error('finalize_review can only be called once per session.');
    }
    finalized = true;
    await store.append({
      eventType: 'session_finalized',
      payload: {
        totalFindings: findingsBuffer.length,
        ...(parsed.summary ? { summary: parsed.summary } : {}),
      },
    });
    return { ok: true };
  }

  const tools: Record<string, AgentToolDefinition> = {
    lint: {
      description: 'Run a configured lint rule against a file.',
      inputSchema: LINT_TOOL_INPUT_SCHEMA,
      execute: (input) => runTool('lint', input, lintToolHandler),
    },
    report_finding: {
      description: 'Record a top-level finding for the report.',
      inputSchema: TOP_LEVEL_REPORT_INPUT_SCHEMA,
      execute: (input) => runTool('report_finding', input, reportFindingToolHandler),
    },
    read_file: {
      description: 'Read a file inside the repository root.',
      inputSchema: READ_FILE_INPUT_SCHEMA,
      execute: (input) => runTool('read_file', input, readFileToolHandler),
    },
    search_files: {
      description: 'Find files in the repository by glob pattern.',
      inputSchema: SEARCH_FILES_INPUT_SCHEMA,
      execute: (input) => runTool('search_files', input, searchFilesToolHandler),
    },
    list_directory: {
      description: 'List files and directories inside a path in the repository.',
      inputSchema: LIST_DIRECTORY_INPUT_SCHEMA,
      execute: (input) => runTool('list_directory', input, listDirectoryToolHandler),
    },
    search_content: {
      description: 'Search repository text content by substring and optional glob.',
      inputSchema: SEARCH_CONTENT_INPUT_SCHEMA,
      execute: (input) => runTool('search_content', input, searchContentToolHandler),
    },
    finalize_review: {
      description: 'Finalize review output and close the session.',
      inputSchema: FINALIZE_REVIEW_INPUT_SCHEMA,
      execute: (input) => runTool('finalize_review', input, finalizeReviewToolHandler),
    },
  };

  let usage: AgentToolLoopResult['usage'] | undefined;
  let hadOperationalErrors = false;
  let errorMessage: string | undefined;

  try {
    const result = await provider.runAgentToolLoop({
      systemPrompt: buildAgentSystemPrompt({
        repositoryRoot,
        targets: relativeTargets,
        availableRuleSources: validSources,
      }),
      prompt: [
        `Repository root: ${repositoryRoot}`,
        `Targets: ${relativeTargets.join(', ')}`,
        `Available ruleSources: ${validSources.join(', ')}`,
      ].join('\n'),
      tools,
      ...(maxSteps !== undefined ? { maxSteps } : {}),
      ...(maxRetries !== undefined ? { maxRetries } : {}),
      ...(maxParallelToolCalls !== undefined ? { maxParallelToolCalls } : {}),
    });
    usage = result.usage;
  } catch (error) {
    hadOperationalErrors = true;
    errorMessage = error instanceof Error ? error.message : String(error);
  } finally {
    if (relativeTargets.length > 0) {
      for (let index = 0; index < relativeTargets.length; index += 1) {
        const file = relativeTargets[index]!;
        progressReporter?.finishFile(file);
        const next = relativeTargets[index + 1];
        if (next) {
          progressReporter?.startFile(next, defaultRuleName);
        }
      }
    }
    progressReporter?.finishRun();
  }

  const events = await store.replay();
  const hasFinalizedEvent = events.some((event) => event.eventType === 'session_finalized');

  if (!hasFinalizedEvent) {
    hadOperationalErrors = true;
    if (!errorMessage) {
      errorMessage = 'Agent run ended without finalize_review.';
    }
  }

  const findings = hasFinalizedEvent ? findingsFromEvents(events) : [];

  return {
    findings,
    events,
    hadOperationalErrors,
    ...(errorMessage ? { errorMessage } : {}),
    ...(usage ? { usage } : {}),
  };
}

function resolveEvaluatorType(evaluator: string | undefined): string {
  return evaluator || Type.BASE;
}
