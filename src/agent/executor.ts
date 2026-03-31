import { readFileSync, readdirSync, statSync } from 'fs';
import * as path from 'path';
import type { PromptFile } from '../prompts/prompt-loader';
import type { LLMProvider } from '../providers/llm-provider';
import { Severity } from '../evaluators/types';
import { checkTarget } from '../prompts/target';
import { isJudgeResult, type PromptEvaluationResult } from '../prompts/schema';
import { createEvaluator } from '../evaluators';
import { calculateCheckScore } from '../scoring';
import { computeFilterDecision } from '../evaluators/violation-filter';
import { locateQuotedText } from '../output/location';
import type { FilePatternConfig } from '../boundaries/file-section-parser';
import { ScanPathResolver } from '../boundaries/scan-path-resolver';
import type { TokenUsageStats } from '../providers/token-usage';
import {
  LINT_TOOL_INPUT_SCHEMA,
  TOP_LEVEL_REPORT_INPUT_SCHEMA,
  FINALIZE_REVIEW_INPUT_SCHEMA,
  READ_FILE_INPUT_SCHEMA,
  SEARCH_FILES_INPUT_SCHEMA,
  LIST_DIRECTORY_INPUT_SCHEMA,
  type AgentFinding,
  type SessionEvent,
} from './types';
import { createReviewSessionStore, type ReviewSessionStore } from './review-session-store';
import { resolvePathInRepo, toRelativePath } from './path-utils';
import { loadAgentRuntimeConfig } from './config';
import { AgentProgressReporter } from './progress';
import { OutputFormat } from '../cli/types';

const MODEL_STEP_SCHEMA = {
  name: 'AgentStep',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['toolName', 'input'],
    properties: {
      reasoning: { type: 'string' },
      toolName: {
        type: 'string',
        enum: [
          'lint',
          'report_finding',
          'finalize_review',
          'read_file',
          'search_files',
          'list_directory',
        ],
      },
      input: {
        type: 'object',
      },
    },
  } as Record<string, unknown>,
};

interface RuleSourceEntry {
  ruleSource: string;
  canonicalRuleId: string;
  prompt: PromptFile;
  allowedFiles: Set<string>;
}

export interface AgentExecutorParams {
  targets: string[];
  prompts: PromptFile[];
  provider: LLMProvider;
  repositoryRoot: string;
  scanPaths: FilePatternConfig[];
  outputFormat: OutputFormat;
  printMode: boolean;
  userInstructionContent?: string;
  sessionHomeDir?: string;
  modelRunner?: (context: AgentModelRunnerContext) => Promise<AgentModelStep>;
  maxTurns?: number;
}

export interface AgentExecutorResult {
  findings: AgentFinding[];
  events: SessionEvent[];
  validRuleSources: string[];
  hadOperationalErrors: boolean;
  errorMessage?: string;
  tokenUsage?: TokenUsageStats;
}

interface AgentModelStep {
  toolName: string;
  input: Record<string, unknown>;
}

interface AgentModelRunnerContext {
  systemPrompt: string;
  transcript: AgentTranscriptItem[];
  availableTools: string[];
}

interface AgentTranscriptItem {
  role: 'tool' | 'system';
  content: string;
}

interface ToolResult {
  ok: boolean;
  output: Record<string, unknown>;
  findingsAdded?: number;
  error?: string;
}

function canonicalRuleIdFromPrompt(prompt: PromptFile): string {
  const pack = prompt.pack || 'Default';
  const rule = (prompt.meta.id || path.basename(prompt.filename, path.extname(prompt.filename)) || 'Rule').toString();
  return `${pack}.${rule}`;
}

function ruleSourceFromPrompt(prompt: PromptFile): string {
  if (prompt.filename === 'VECTORLINT.md') {
    return 'packs/default/VECTORLINT.md';
  }
  const pack = (prompt.pack || 'default').toLowerCase();
  return `packs/${pack}/${path.basename(prompt.filename)}`;
}

function buildRuleSourceRegistry(params: {
  targets: string[];
  prompts: PromptFile[];
  scanPaths: FilePatternConfig[];
  repositoryRoot: string;
  userInstructionContent?: string;
}): Map<string, RuleSourceEntry> {
  const registry = new Map<string, RuleSourceEntry>();
  const resolver = new ScanPathResolver();
  const availablePacks = Array.from(
    new Set(params.prompts.map((prompt) => prompt.pack).filter((pack): pack is string => Boolean(pack)))
  );

  for (const target of params.targets) {
    const relFile = toRelativePath(params.repositoryRoot, target);
    const resolution = resolver.resolveConfiguration(relFile, params.scanPaths, availablePacks);
    const applicablePrompts = params.prompts.filter((prompt) => {
      if (prompt.pack === '') return true;
      if (!prompt.pack || !resolution.packs.includes(prompt.pack)) return false;
      if (!prompt.meta?.id) return true;
      const disableKey = `${prompt.pack}.${prompt.meta.id}`;
      const overrideValue = resolution.overrides[disableKey];
      return !(typeof overrideValue === 'string' && overrideValue.toLowerCase() === 'disabled');
    });

    for (const prompt of applicablePrompts) {
      const source = ruleSourceFromPrompt(prompt);
      const existing = registry.get(source);
      if (existing) {
        existing.allowedFiles.add(relFile);
        continue;
      }
      registry.set(source, {
        ruleSource: source,
        canonicalRuleId: canonicalRuleIdFromPrompt(prompt),
        prompt,
        allowedFiles: new Set([relFile]),
      });
    }

    if (params.userInstructionContent) {
      const vectorPrompt: PromptFile = {
        id: 'VECTORLINT.md',
        filename: 'VECTORLINT.md',
        fullPath: 'VECTORLINT.md',
        pack: 'Default',
        body: params.userInstructionContent,
        meta: {
          id: 'VECTORLINT',
          name: 'VECTORLINT',
          severity: Severity.WARNING,
        },
      };
      const source = ruleSourceFromPrompt(vectorPrompt);
      const existing = registry.get(source);
      if (existing) {
        existing.allowedFiles.add(relFile);
      } else {
        registry.set(source, {
          ruleSource: source,
          canonicalRuleId: 'Default.VECTORLINT',
          prompt: vectorPrompt,
          allowedFiles: new Set([relFile]),
        });
      }
    }
  }

  return registry;
}

function buildSystemPrompt(params: {
  targets: string[];
  rules: RuleSourceEntry[];
  repositoryRoot: string;
}): string {
  const fileCatalog = params.targets.map((target) => toRelativePath(params.repositoryRoot, target));
  const ruleCatalog = params.rules.map((rule) => ({
    ruleSource: rule.ruleSource,
    ruleId: rule.canonicalRuleId,
    allowedFiles: Array.from(rule.allowedFiles.values()),
  }));

  return [
    'Role: You are a senior technical content reviewer operating VectorLint agent mode.',
    'Operating Policy:',
    '- Process files first, then rules.',
    '- Use lint for inline findings.',
    '- Use read_file/search_files/list_directory for structural checks.',
    '- Use report_finding for top-level findings only.',
    '- finalize_review is mandatory before completion.',
    'Runtime Context:',
    `requested targets: ${JSON.stringify(fileCatalog)}`,
    `rule source catalog: ${JSON.stringify(ruleCatalog)}`,
  ].join('\n');
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function appendToolCallStarted(
  store: ReviewSessionStore,
  toolName: string,
  input: Record<string, unknown>
): Promise<void> {
  await store.append({
    eventType: 'tool_call_started',
    payload: { toolName, input },
  });
}

async function appendToolCallFinished(
  store: ReviewSessionStore,
  toolName: string,
  success: boolean,
  output: Record<string, unknown>,
  error?: string
): Promise<void> {
  await store.append({
    eventType: 'tool_call_finished',
    payload: {
      toolName,
      success,
      output,
      ...(error ? { error } : {}),
    },
  });
}

function validateRuleSourceOrThrow(ruleSource: string, registry: Map<string, RuleSourceEntry>): RuleSourceEntry {
  const entry = registry.get(ruleSource);
  if (!entry) {
    const valid = Array.from(registry.keys()).sort();
    throw new Error(`Unknown ruleSource '${ruleSource}'. Valid sources: ${valid.join(', ')}`);
  }
  return entry;
}

function validateFileAllowedOrThrow(file: string, entry: RuleSourceEntry): void {
  if (!entry.allowedFiles.has(file)) {
    throw new Error(`File '${file}' is not in allowedFiles for ruleSource '${entry.ruleSource}'.`);
  }
}

function listDirectoryEntries(directoryPath: string): string[] {
  const names = readdirSync(directoryPath);
  return names.sort((a, b) => a.localeCompare(b));
}

function searchFilesWithinRepo(repositoryRoot: string, pattern: string): Array<{ file: string; lines: number[] }> {
  if (pattern.length > 200) {
    throw new Error('search_files pattern is too long');
  }
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, 'i');
  } catch {
    throw new Error(`Invalid search_files pattern: ${pattern}`);
  }
  const queue = [repositoryRoot];
  const matches: Array<{ file: string; lines: number[] }> = [];

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) continue;
    const entries = readdirSync(current);
    for (const entry of entries) {
      if (entry === '.git' || entry === 'node_modules' || entry === 'dist') continue;
      const absolute = path.join(current, entry);
      const stat = statSync(absolute);
      if (stat.isDirectory()) {
        queue.push(absolute);
        continue;
      }
      if (stat.size > 1024 * 1024) {
        continue;
      }
      const content = readFileSync(absolute, 'utf8');
      const lines = content.split(/\r?\n/);
      const lineMatches: number[] = [];
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (line !== undefined && regex.test(line)) {
          lineMatches.push(i + 1);
        }
      }
      if (lineMatches.length > 0) {
        matches.push({
          file: toRelativePath(repositoryRoot, absolute),
          lines: lineMatches.slice(0, 20),
        });
        if (matches.length >= 200) {
          return matches;
        }
      }
    }
  }

  return matches;
}

function toInlineFindings(params: {
  result: PromptEvaluationResult;
  content: string;
  entry: RuleSourceEntry;
  relFile: string;
}): AgentFinding[] {
  if (isJudgeResult(params.result)) {
    const findings: AgentFinding[] = [];
    for (const criterion of params.result.criteria) {
      if (criterion.score <= 1) {
        findings.push({
          file: params.relFile,
          line: 1,
          column: 1,
          message: criterion.summary || `${criterion.name} scored ${criterion.score}`,
          ruleSource: params.entry.ruleSource,
          ruleId: params.entry.canonicalRuleId,
          severity: Severity.ERROR,
          suggestion: undefined,
          match: '',
        });
      } else if (criterion.score === 2) {
        findings.push({
          file: params.relFile,
          line: 1,
          column: 1,
          message: criterion.summary || `${criterion.name} scored ${criterion.score}`,
          ruleSource: params.entry.ruleSource,
          ruleId: params.entry.canonicalRuleId,
          severity: Severity.WARNING,
          suggestion: undefined,
          match: '',
        });
      }
    }
    return findings;
  }

  const surfaced = params.result.violations.filter((violation) => computeFilterDecision(violation).surface);
  const scored = calculateCheckScore(surfaced, params.result.word_count, {
    strictness: params.entry.prompt.meta.strictness,
    promptSeverity: params.entry.prompt.meta.severity,
  });

  const findings: AgentFinding[] = [];
  for (const violation of surfaced) {
    const location = locateQuotedText(
      params.content,
      {
        quoted_text: violation.quoted_text || '',
        context_before: violation.context_before || '',
        context_after: violation.context_after || '',
      },
      80,
      violation.line
    );
    if (!location) {
      continue;
    }
    findings.push({
      file: params.relFile,
      line: location.line,
      column: location.column,
      message: violation.message || 'Rule violation',
      ruleSource: params.entry.ruleSource,
      ruleId: params.entry.canonicalRuleId,
      severity: scored.severity,
      suggestion: violation.suggestion,
      match: location.match || '',
    });
  }
  return findings;
}

async function appendInlineFindingEvents(store: ReviewSessionStore, findings: AgentFinding[]): Promise<void> {
  for (const finding of findings) {
    await store.append({
      eventType: 'finding_recorded_inline',
      payload: {
        kind: 'inline',
        file: finding.file,
        line: finding.line,
        column: finding.column,
        message: finding.message,
        ruleSource: finding.ruleSource,
        ruleId: finding.ruleId,
        severity: finding.severity,
        ...(finding.suggestion ? { suggestion: finding.suggestion } : {}),
        ...(finding.match ? { match: finding.match } : {}),
      },
    });
  }
}

async function appendTopLevelFindingEvent(store: ReviewSessionStore, finding: AgentFinding): Promise<void> {
  await store.append({
    eventType: 'finding_recorded_top_level',
    payload: {
      kind: 'top-level',
      file: finding.file,
      line: finding.line,
      column: finding.column,
      message: finding.message,
      ruleSource: finding.ruleSource,
      ruleId: finding.ruleId,
      severity: finding.severity,
      ...(finding.suggestion ? { suggestion: finding.suggestion } : {}),
      ...(finding.match ? { match: finding.match } : {}),
    },
  });
}

function replayFindings(events: SessionEvent[]): AgentFinding[] {
  const findings: AgentFinding[] = [];
  for (const event of events) {
    if (
      event.eventType === 'finding_recorded_inline' ||
      event.eventType === 'finding_recorded_top_level'
    ) {
      findings.push({
        file: event.payload.file,
        line: event.payload.line,
        column: event.payload.column,
        message: event.payload.message,
        ruleSource: event.payload.ruleSource,
        ruleId: event.payload.ruleId,
        severity: event.payload.severity,
        suggestion: event.payload.suggestion,
        match: event.payload.match,
      });
    }
  }
  return findings;
}

async function runWithRetries<T>(
  operation: () => Promise<T>,
  maxRetries: number
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error;
      const delay = 100 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error(`Agent model call failed after ${maxRetries} attempts: ${asErrorMessage(lastError)}`);
}

async function defaultModelRunner(
  params: {
    provider: LLMProvider;
    context: AgentModelRunnerContext;
    maxRetries: number;
    tokenUsage: TokenUsageStats;
  }
): Promise<AgentModelStep> {
  const content = JSON.stringify(
    {
      transcript: params.context.transcript,
      availableTools: params.context.availableTools,
    },
    null,
    2
  );

  const response = await runWithRetries(
    async () =>
      params.provider.runPromptStructured<{
        toolName: string;
        input: Record<string, unknown>;
      }>(content, params.context.systemPrompt, MODEL_STEP_SCHEMA),
    params.maxRetries
  );

  if (response.usage) {
    params.tokenUsage.totalInputTokens += response.usage.inputTokens;
    params.tokenUsage.totalOutputTokens += response.usage.outputTokens;
  }

  return {
    toolName: response.data.toolName,
    input: response.data.input || {},
  };
}

export async function runAgentExecutor(params: AgentExecutorParams): Promise<AgentExecutorResult> {
  const registry = buildRuleSourceRegistry({
    targets: params.targets,
    prompts: params.prompts,
    scanPaths: params.scanPaths,
    repositoryRoot: params.repositoryRoot,
    userInstructionContent: params.userInstructionContent,
  });

  const store = await createReviewSessionStore(
    params.sessionHomeDir ? { homeDir: params.sessionHomeDir } : {}
  );
  await store.append({
    eventType: 'session_started',
    payload: {
      cwd: params.repositoryRoot,
      targets: params.targets.map((target) => toRelativePath(params.repositoryRoot, target)),
    },
  });

  const runtimeConfig = loadAgentRuntimeConfig();
  const tokenUsage: TokenUsageStats = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
  };
  const progress = new AgentProgressReporter({
    enabled: params.outputFormat === OutputFormat.Line && !params.printMode,
  });

  const systemPrompt = buildSystemPrompt({
    targets: params.targets,
    rules: Array.from(registry.values()),
    repositoryRoot: params.repositoryRoot,
  });
  const availableTools = [
    'lint',
    'report_finding',
    'finalize_review',
    'read_file',
    'search_files',
    'list_directory',
  ];

  const transcript: AgentTranscriptItem[] = [];
  const maxTurns = params.maxTurns ?? 300;

  const executeTool = async (toolName: string, input: Record<string, unknown>): Promise<ToolResult> => {
    await appendToolCallStarted(store, toolName, input);
    progress.onToolCall(toolName, input);
    try {
      if (toolName === 'lint') {
        const parsed = LINT_TOOL_INPUT_SCHEMA.parse(input);
        const entry = validateRuleSourceOrThrow(parsed.ruleSource, registry);
        validateFileAllowedOrThrow(parsed.file, entry);
        progress.onLintContext(parsed.file, parsed.ruleSource);
        const absolute = resolvePathInRepo(params.repositoryRoot, parsed.file);
        const content = readFileSync(absolute, 'utf8');
        const evaluator = createEvaluator(
          entry.prompt.meta.evaluator || 'base',
          params.provider,
          entry.prompt
        );
        const result = await evaluator.evaluate(parsed.file, content);
        if (result.usage) {
          tokenUsage.totalInputTokens += result.usage.inputTokens;
          tokenUsage.totalOutputTokens += result.usage.outputTokens;
        }

        const findings = toInlineFindings({
          result,
          content,
          entry,
          relFile: parsed.file,
        });
        await appendInlineFindingEvents(store, findings);

        const output = {
          file: parsed.file,
          ruleSource: parsed.ruleSource,
          canonicalRuleId: entry.canonicalRuleId,
          violations: findings.map((finding) => ({
            line: finding.line,
            column: finding.column,
            message: finding.message,
            severity: finding.severity,
            suggestion: finding.suggestion,
            match: finding.match || '',
          })),
        };
        await appendToolCallFinished(store, toolName, true, output);
        return { ok: true, output, findingsAdded: findings.length };
      }

      if (toolName === 'report_finding') {
        const parsed = TOP_LEVEL_REPORT_INPUT_SCHEMA.parse(input);
        const entry = validateRuleSourceOrThrow(parsed.ruleSource, registry);
        const reference = parsed.references?.[0];
        let file = reference?.file || params.targets.map((target) => toRelativePath(params.repositoryRoot, target))[0] || '.';
        let line = reference?.startLine ?? 1;
        let column = 1;
        if (reference?.file) {
          const absolute = resolvePathInRepo(params.repositoryRoot, reference.file);
          file = toRelativePath(params.repositoryRoot, absolute);
          line = reference.startLine ?? 1;
          column = 1;
        }
        const finding: AgentFinding = {
          file,
          line,
          column,
          message: parsed.message,
          ruleSource: parsed.ruleSource,
          ruleId: entry.canonicalRuleId,
          severity: entry.prompt.meta.severity ?? Severity.WARNING,
          suggestion: parsed.suggestion,
          match: '',
        };
        await appendTopLevelFindingEvent(store, finding);
        const output = {
          recorded: true,
          file,
          line,
          column,
          ruleId: entry.canonicalRuleId,
        };
        await appendToolCallFinished(store, toolName, true, output);
        return { ok: true, output, findingsAdded: 1 };
      }

      if (toolName === 'finalize_review') {
        const parsed = FINALIZE_REVIEW_INPUT_SCHEMA.parse(input);
        const events = await store.replay();
        const findings = replayFindings(events);
        await store.append({
          eventType: 'session_finalized',
          payload: {
            totalFindings: findings.length,
            ...(parsed.summary ? { summary: parsed.summary } : {}),
          },
        });
        const output = {
          finalized: true,
          totalFindings: findings.length,
        };
        await appendToolCallFinished(store, toolName, true, output);
        return { ok: true, output };
      }

      if (toolName === 'read_file') {
        const parsed = READ_FILE_INPUT_SCHEMA.parse(input);
        const absolute = resolvePathInRepo(params.repositoryRoot, parsed.path);
        const content = readFileSync(absolute, 'utf8');
        const output = {
          path: toRelativePath(params.repositoryRoot, absolute),
          content,
        };
        const logOutput = {
          path: output.path,
          bytes: Buffer.byteLength(content, 'utf8'),
        };
        await appendToolCallFinished(store, toolName, true, logOutput);
        return { ok: true, output };
      }

      if (toolName === 'list_directory') {
        const parsed = LIST_DIRECTORY_INPUT_SCHEMA.parse(input);
        const absolute = resolvePathInRepo(params.repositoryRoot, parsed.path);
        const output = {
          path: toRelativePath(params.repositoryRoot, absolute),
          entries: listDirectoryEntries(absolute),
        };
        await appendToolCallFinished(store, toolName, true, output);
        return { ok: true, output };
      }

      if (toolName === 'search_files') {
        const parsed = SEARCH_FILES_INPUT_SCHEMA.parse(input);
        const output = {
          pattern: parsed.pattern,
          matches: searchFilesWithinRepo(params.repositoryRoot, parsed.pattern),
        };
        await appendToolCallFinished(store, toolName, true, {
          pattern: parsed.pattern,
          matchesCount: output.matches.length,
        });
        return { ok: true, output };
      }

      throw new Error(`Unknown tool: ${toolName}`);
    } catch (error: unknown) {
      const message = asErrorMessage(error);
      const output = { error: message };
      await appendToolCallFinished(store, toolName, false, output, message);
      return { ok: false, output, error: message };
    }
  };

  let hadOperationalErrors = false;
  let terminalError: string | undefined;
  let finalized = false;

  for (let turn = 0; turn < maxTurns; turn += 1) {
    let step: AgentModelStep;
    try {
      const context: AgentModelRunnerContext = {
        systemPrompt,
        transcript,
        availableTools,
      };
      step = params.modelRunner
        ? await params.modelRunner(context)
        : await defaultModelRunner({
            provider: params.provider,
            context,
            maxRetries: runtimeConfig.maxRetries,
            tokenUsage,
          });
    } catch (error: unknown) {
      hadOperationalErrors = true;
      terminalError = asErrorMessage(error);
      break;
    }

    const result = await executeTool(step.toolName, step.input);
    transcript.push({
      role: 'tool',
      content: JSON.stringify({
        toolName: step.toolName,
        input: step.input,
        result: result.output,
      }),
    });

    if (!result.ok) {
      hadOperationalErrors = true;
    }

    if (step.toolName === 'lint' && result.ok) {
      const parsed = LINT_TOOL_INPUT_SCHEMA.safeParse(step.input);
      if (parsed.success) {
        const targetFileAbsolute = resolvePathInRepo(params.repositoryRoot, parsed.data.file);
        const content = readFileSync(targetFileAbsolute, 'utf8');
        const entry = validateRuleSourceOrThrow(parsed.data.ruleSource, registry);
        const targetCheck = checkTarget(content, entry.prompt.meta.target, undefined);
        transcript.push({
          role: 'system',
          content: `target_check_missing=${String(targetCheck.missing)}`,
        });
      }
    }

    if (step.toolName === 'finalize_review' && result.ok) {
      finalized = true;
      break;
    }
  }

  if (!finalized) {
    hadOperationalErrors = true;
    if (!terminalError) {
      terminalError = 'finalize_review was not called';
    }
  }

  progress.onRunFinished();
  progress.beforeFindings();

  const events = await store.replay();
  const findings = replayFindings(events);

  return {
    findings,
    events,
    validRuleSources: Array.from(registry.keys()).sort(),
    hadOperationalErrors,
    ...(terminalError ? { errorMessage: terminalError } : {}),
    tokenUsage,
  };
}
