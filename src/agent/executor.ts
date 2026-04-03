import { readdir, readFile } from 'fs/promises';
import * as os from 'os';
import fg from 'fast-glob';
import {
  buildBundledCheckLLMSchema,
  isJudgeResult,
  type BundledCheckLLMResult,
} from '../prompts/schema';
import type { PromptFile } from '../prompts/prompt-loader';
import { Severity } from '../evaluators/types';
import { computeFilterDecision } from '../evaluators/violation-filter';
import { locateQuotedText } from '../output/location';
import type { AgentToolLoopResult, LLMProvider } from '../providers/llm-provider';
import type { ModelCapabilityTier } from '../providers/model-capability';
import type { TokenUsage } from '../providers/token-usage';
import type { OutputFormat } from '../cli/types';
import { createReviewSessionStore } from './review-session-store';
import { buildAgentSystemPrompt } from './prompt-builder';
import { AgentToolError } from '../errors';
import { ScanPathResolver } from '../boundaries/scan-path-resolver';
import { buildMatchedRuleUnits } from './rule-units';
import {
  createAgentTools,
  listAvailableTools,
  type AgentToolHandler,
  type AgentToolName,
} from './tools-registry';
import {
  LINT_TOOL_INPUT_SCHEMA,
  FINALIZE_REVIEW_INPUT_SCHEMA,
  LIST_DIRECTORY_INPUT_SCHEMA,
  READ_FILE_INPUT_SCHEMA,
  SEARCH_CONTENT_INPUT_SCHEMA,
  SEARCH_FILES_INPUT_SCHEMA,
  TOP_LEVEL_REPORT_INPUT_SCHEMA,
  SESSION_EVENT_TYPE,
  type SessionEvent,
} from './types';
import { resolveGlobPatternWithinRoot, resolveWithinRoot, toRelativePathFromRoot } from './path-utils';
import type { AgentProgressReporter, VisibleToolName, VisibleToolProgress } from './progress';
import { buildRuleId, normalizeRuleSource } from './rule-id';
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
  provider?: LLMProvider;
  orchestratorProvider?: LLMProvider;
  lintProvider?: LLMProvider;
  resolveCapabilityProvider?: (requested: ModelCapabilityTier) => LLMProvider;
  workspaceRoot: string;
  scanPaths: Array<{ pattern: string; runRules: string[]; overrides: Record<string, string> }>;
  outputFormat: OutputFormat;
  printMode: boolean;
  sessionHomeDir?: string;
  progressReporter?: AgentProgressReporter;
  maxSteps?: number;
  maxRetries?: number;
  maxParallelToolCalls?: number;
  userInstructions?: string;
}

export interface AgentExecutorResult {
  findings: AgentFinding[];
  events: SessionEvent[];
  fileRuleMatches: Array<{ file: string; ruleSource: string }>;
  requestFailures: number;
  hadOperationalErrors: boolean;
  errorMessage?: string;
  usage?: AgentToolLoopResult['usage'];
}

const MAX_SEARCH_FILE_RESULTS = 500;
const MAX_CONTENT_MATCH_RESULTS = 200;
const MATCHED_RULE_UNIT_TOKEN_BUDGET = 800;
const VISIBLE_TOOL_NAMES = new Set<VisibleToolName>(['read_file', 'list_directory', 'lint']);

function mergeTokenUsage(left?: TokenUsage, right?: TokenUsage): TokenUsage | undefined {
  if (!left && !right) {
    return undefined;
  }

  return {
    inputTokens: (left?.inputTokens ?? 0) + (right?.inputTokens ?? 0),
    outputTokens: (left?.outputTokens ?? 0) + (right?.outputTokens ?? 0),
  };
}

function buildUnknownRuleSourceError(ruleSource: string, validSources: string[]): Error {
  const validHint = validSources.length > 0 ? validSources.join(', ') : '(none)';
  return new AgentToolError(
    `Unknown ruleSource "${ruleSource}". Valid sources: ${validHint}`,
    'UNKNOWN_RULE_SOURCE'
  );
}

function fallbackMessage(reasoning?: string): string {
  if (reasoning) {
    return reasoning;
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
  workspaceRoot: string,
  targets: string[],
  file?: string
): string {
  if (file && file.trim().length > 0) {
    const resolved = resolveWithinRoot(workspaceRoot, file);
    return toRelativePathFromRoot(workspaceRoot, resolved);
  }
  if (targets.length > 0) {
    return toRelativePathFromRoot(workspaceRoot, targets[0]!);
  }
  return '.';
}

function buildEffectiveRuleBody(
  prompt: PromptFile,
  params: { reviewInstruction?: string; context?: string }
): string {
  const reviewInstruction = params.reviewInstruction?.trim();
  const context = params.context?.trim();
  const body = reviewInstruction || prompt.body;

  if (!context) {
    return body;
  }

  return `${body}\n\nRequired context for this review:\n${context}`;
}

function buildBundledLintPrompt(
  ruleCalls: Array<{
    ruleSource: string;
    prompt: PromptFile;
    reviewInstruction?: string;
    context?: string;
  }>
): string {
  const sections = ruleCalls.flatMap((ruleCall, index) => [
    `Rule ${index + 1}`,
    `ruleSource: ${ruleCall.ruleSource}`,
    buildEffectiveRuleBody(ruleCall.prompt, ruleCall),
    '',
  ]);

  return [
    'Review the file against all of the following source-backed rules.',
    'Keep findings attributed to the exact ruleSource that each issue belongs to.',
    '',
    ...sections,
  ].join('\n').trim();
}

function findingsFromEvents(events: SessionEvent[]): AgentFinding[] {
  const findings: AgentFinding[] = [];

  for (const event of events) {
    if (
      event.eventType !== SESSION_EVENT_TYPE.FindingRecordedInline &&
      event.eventType !== SESSION_EVENT_TYPE.FindingRecordedTopLevel
    ) {
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

// Build the concrete matched file-to-rule pairs that the agent should review for this run.
function buildFileRuleMatches(
  relativeTargets: string[],
  prompts: PromptFile[],
  scanPaths: Array<{ pattern: string; runRules: string[]; overrides: Record<string, string> }>
): Array<{ file: string; ruleSource: string }> {
  const resolver = new ScanPathResolver();
  const availablePacks = Array.from(new Set(prompts.map((p) => p.pack).filter((p): p is string => !!p)));
  const matches: Array<{ file: string; ruleSource: string }> = [];

  for (const relFile of relativeTargets) {
    const resolution =
      scanPaths.length > 0
        ? resolver.resolveConfiguration(relFile, scanPaths, availablePacks)
        : { packs: availablePacks, overrides: {} };
    const matchedPrompts = prompts.filter((prompt) => {
      if (prompt.pack === '') return true;
      if (!prompt.pack) return false;
      if (scanPaths.length > 0 && !resolution.packs.includes(prompt.pack)) return false;
      if (!prompt.meta?.id) return true;
      const disableKey = `${prompt.pack}.${prompt.meta.id}`;
      const overrideValue = resolution.overrides[disableKey];
      return typeof overrideValue !== 'string' || overrideValue.toLowerCase() !== 'disabled';
    });

    for (const prompt of matchedPrompts) {
      matches.push({ file: relFile, ruleSource: normalizeRuleSource(prompt.fullPath) });
    }
  }

  return matches;
}

function summarizeToolOutput(toolName: AgentToolName, output: unknown): unknown {
  if (typeof output !== 'object' || output === null) {
    return output;
  }

  const candidate = output as Record<string, unknown>;

  switch (toolName) {
    case 'read_file': {
      const content = typeof candidate.content === 'string' ? candidate.content : '';
      return {
        ...(typeof candidate.path === 'string' ? { path: candidate.path } : {}),
        contentLength: content.length,
      };
    }
    case 'search_content': {
      const matches = Array.isArray(candidate.matches) ? candidate.matches : [];
      return {
        matchCount: matches.length,
        ...(candidate.truncated === true ? { truncated: true } : {}),
      };
    }
    case 'search_files': {
      const matches = Array.isArray(candidate.matches) ? candidate.matches : [];
      return {
        matchCount: matches.length,
        ...(candidate.truncated === true ? { truncated: true } : {}),
      };
    }
    case 'list_directory': {
      const entries = Array.isArray(candidate.entries) ? candidate.entries : [];
      return {
        ...(typeof candidate.path === 'string' ? { path: candidate.path } : {}),
        entryCount: entries.length,
      };
    }
    default:
      return output;
  }
}

interface VisibleToolContext extends VisibleToolProgress {
  signature: string;
  progressFile?: string;
}

function countLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }
  return content.split('\n').filter((_, index, lines) => {
    return !(index === lines.length - 1 && lines[index] === '');
  }).length;
}

function tryResolveRelativePath(workspaceRoot: string, rawPath: string): string | undefined {
  try {
    return toRelativePathFromRoot(workspaceRoot, resolveWithinRoot(workspaceRoot, rawPath));
  } catch {
    return undefined;
  }
}

function resolveVisibleToolContext(params: {
  toolName: AgentToolName;
  input: unknown;
  workspaceRoot: string;
  promptBySource: Map<string, PromptFile>;
  targetFiles: Set<string>;
  currentProgressFile?: string;
  defaultProgressFile?: string;
}): VisibleToolContext | undefined {
  const {
    toolName,
    input,
    workspaceRoot,
    promptBySource,
    targetFiles,
    currentProgressFile,
    defaultProgressFile,
  } = params;

  if (!VISIBLE_TOOL_NAMES.has(toolName as VisibleToolName)) {
    return undefined;
  }

  switch (toolName) {
    case 'read_file': {
      const parsed = READ_FILE_INPUT_SCHEMA.safeParse(input);
      if (!parsed.success) {
        return undefined;
      }
      const resolvedPath = tryResolveRelativePath(workspaceRoot, parsed.data.path);
      const path = resolvedPath ?? parsed.data.path;
      return {
        toolName: 'read_file',
        path,
        progressFile: resolvedPath && targetFiles.has(resolvedPath)
          ? resolvedPath
          : (currentProgressFile ?? defaultProgressFile),
        signature: `read_file:${path}`,
      };
    }
    case 'list_directory': {
      const parsed = LIST_DIRECTORY_INPUT_SCHEMA.safeParse(input);
      if (!parsed.success) {
        return undefined;
      }
      const resolvedPath = tryResolveRelativePath(workspaceRoot, parsed.data.path);
      const path = resolvedPath ?? parsed.data.path;
      return {
        toolName: 'list_directory',
        path,
        progressFile: currentProgressFile ?? defaultProgressFile,
        signature: `list_directory:${path}`,
      };
    }
    case 'lint': {
      const parsed = LINT_TOOL_INPUT_SCHEMA.safeParse(input);
      if (!parsed.success) {
        return undefined;
      }
      const firstRule = parsed.data.rules[0];
      const prompt = firstRule
        ? resolvePromptBySource(firstRule.ruleSource, promptBySource)
        : undefined;
      const resolvedPath = tryResolveRelativePath(workspaceRoot, parsed.data.file);
      const path = resolvedPath ?? parsed.data.file;
      const ruleText = parsed.data.rules
        .map((rule) => {
          const resolvedPrompt = resolvePromptBySource(rule.ruleSource, promptBySource);
          return resolvedPrompt
            ? buildEffectiveRuleBody(resolvedPrompt, rule)
            : (rule.reviewInstruction?.trim() || '');
        })
        .join('\n');
      return {
        toolName: 'lint',
        path,
        ruleName: parsed.data.rules.length > 1
          ? `${String(prompt?.meta.name || prompt?.meta.id || 'Rule')} +${parsed.data.rules.length - 1} more`
          : String(prompt?.meta.name || prompt?.meta.id || 'Rule'),
        ruleText,
        progressFile: resolvedPath && targetFiles.has(resolvedPath)
          ? resolvedPath
          : (currentProgressFile ?? defaultProgressFile),
        signature: `lint:${path}:${parsed.data.rules.map((rule) => normalizeRuleSource(rule.ruleSource)).join(',')}:${ruleText}`,
      };
    }
  }
}

function buildVisibleToolSuccessState(
  context: VisibleToolContext,
  output: unknown
): VisibleToolProgress {
  switch (context.toolName) {
    case 'read_file': {
      const record = typeof output === 'object' && output !== null ? (output as Record<string, unknown>) : {};
      const content = typeof record.content === 'string' ? record.content : '';
      return {
        ...context,
        lineCount: countLines(content),
      };
    }
    case 'list_directory': {
      const record = typeof output === 'object' && output !== null ? (output as Record<string, unknown>) : {};
      const entries = Array.isArray(record.entries) ? record.entries : [];
      return {
        ...context,
        entryCount: entries.length,
      };
    }
    case 'lint': {
      const record = typeof output === 'object' && output !== null ? (output as Record<string, unknown>) : {};
      return {
        ...context,
        findingsCount:
          typeof record.findingsRecorded === 'number' ? Math.max(0, Math.trunc(record.findingsRecorded)) : 0,
      };
    }
  }
}

type FindingLikeViolation = {
  line?: number;
  quoted_text?: string;
  context_before?: string;
  context_after?: string;
  description?: string;
  analysis?: string;
  message?: string;
  suggestion?: string;
  fix?: string;
  confidence?: number;
  checks?: {
    plausible_non_violation?: boolean;
    context_supports_violation?: boolean;
    rule_supports_claim?: boolean;
  };
};

async function appendInlineFinding(params: {
  violation: FindingLikeViolation;
  reasoning?: string;
  content: string;
  relFile: string;
  prompt: PromptFile;
  ruleSource: string;
  store: Awaited<ReturnType<typeof createReviewSessionStore>>;
}): Promise<boolean> {
  const { violation, reasoning, content, relFile, prompt, ruleSource, store } = params;
  const filterDecision = computeFilterDecision(violation);
  if (!filterDecision.surface) {
    return false;
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
  const message = (violation.message || violation.description || fallbackMessage(reasoning)).trim();

  const finding: AgentFinding = {
    file: relFile,
    line,
    column,
    severity: severityFromPrompt(prompt),
    message,
    ruleId: buildRuleId(prompt),
    ruleSource: normalizeRuleSource(ruleSource),
    ...(violation.analysis ? { analysis: violation.analysis } : {}),
    ...(violation.suggestion ? { suggestion: violation.suggestion } : {}),
    ...(violation.fix ? { fix: violation.fix } : {}),
    ...(match ? { match } : {}),
  };

  await store.append({
    eventType: SESSION_EVENT_TYPE.FindingRecordedInline,
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

  return true;
}

export async function runAgentExecutor(params: RunAgentExecutorParams): Promise<AgentExecutorResult> {
  const {
    targets,
    prompts,
    provider,
    orchestratorProvider,
    lintProvider,
    resolveCapabilityProvider,
    workspaceRoot,
    scanPaths,
    sessionHomeDir = os.homedir(),
    progressReporter,
    maxSteps,
    maxRetries,
    maxParallelToolCalls,
    userInstructions,
  } = params;
  const defaultProvider = provider ?? orchestratorProvider ?? lintProvider;
  if (!defaultProvider) {
    throw new Error('runAgentExecutor requires at least one provider.');
  }
  const effectiveResolveCapabilityProvider = resolveCapabilityProvider
    ?? ((_requested: ModelCapabilityTier) => defaultProvider);
  const effectiveOrchestratorProvider = orchestratorProvider ?? effectiveResolveCapabilityProvider('high-capability');
  const effectiveLintProvider = lintProvider ?? effectiveResolveCapabilityProvider('mid-capability');

  const promptBySource = new Map<string, PromptFile>();
  for (const prompt of prompts) {
    promptBySource.set(normalizeRuleSource(prompt.fullPath), prompt);
  }
  const validSources = Array.from(promptBySource.keys()).sort();

  const store = await createReviewSessionStore({ homeDir: sessionHomeDir });
  let findingsCount = 0;
  const relativeTargets = targets.map((target) =>
    toRelativePathFromRoot(workspaceRoot, resolveWithinRoot(workspaceRoot, target))
  );
  const fileRuleMatches = buildFileRuleMatches(relativeTargets, prompts, scanPaths);
  const matchedRuleUnits = buildMatchedRuleUnits(
    fileRuleMatches,
    promptBySource,
    MATCHED_RULE_UNIT_TOKEN_BUDGET
  );
  const defaultRuleName = String(prompts[0]?.meta.name || prompts[0]?.meta.id || 'Rule');
  const targetFiles = new Set(relativeTargets);

  await store.append({
    eventType: SESSION_EVENT_TYPE.SessionStarted,
    payload: {
      cwd: workspaceRoot,
      targets: relativeTargets,
    },
  });

  let finalized = false;
  let currentProgressFile: string | undefined;
  const failedVisibleToolSignatures = new Set<string>();
  let nestedToolUsage: TokenUsage | undefined;

  async function runTool(
    toolName: AgentToolName,
    input: unknown,
    handler: AgentToolHandler
  ): Promise<unknown> {
    const visibleToolContext = resolveVisibleToolContext({
      toolName,
      input,
      workspaceRoot,
      promptBySource,
      targetFiles,
      currentProgressFile,
      defaultProgressFile: relativeTargets[0],
    });

    if (visibleToolContext?.progressFile) {
      const nextRuleName = visibleToolContext.ruleName ?? defaultRuleName;
      if (currentProgressFile !== visibleToolContext.progressFile) {
        progressReporter?.startFile(visibleToolContext.progressFile, nextRuleName);
        currentProgressFile = visibleToolContext.progressFile;
      } else if (visibleToolContext.ruleName) {
        progressReporter?.updateRule(visibleToolContext.ruleName);
      }
    }

    await store.append({
      eventType: SESSION_EVENT_TYPE.ToolCallStarted,
      payload: { toolName, input },
    });
    if (visibleToolContext) {
      progressReporter?.showVisibleToolStart({
        ...visibleToolContext,
        retrying: failedVisibleToolSignatures.has(visibleToolContext.signature),
      });
    }

    try {
      const output = await handler(input);
      await store.append({
        eventType: SESSION_EVENT_TYPE.ToolCallFinished,
        payload: {
          toolName,
          ok: true,
          output: summarizeToolOutput(toolName, output),
        },
      });
      if (visibleToolContext) {
        progressReporter?.showVisibleToolSuccess(buildVisibleToolSuccessState(visibleToolContext, output));
        failedVisibleToolSignatures.delete(visibleToolContext.signature);
      }
      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await store.append({
        eventType: SESSION_EVENT_TYPE.ToolCallFinished,
        payload: {
          toolName,
          ok: false,
          error: message,
        },
      });
      if (visibleToolContext) {
        progressReporter?.showVisibleToolError(visibleToolContext);
        failedVisibleToolSignatures.add(visibleToolContext.signature);
      }
      throw error;
    }
  }

  async function lintToolHandler(input: unknown): Promise<unknown> {
    const parsed = LINT_TOOL_INPUT_SCHEMA.parse(input);
    const absoluteFile = resolveWithinRoot(workspaceRoot, parsed.file);
    const relFile = toRelativePathFromRoot(workspaceRoot, absoluteFile);
    const content = await readFile(absoluteFile, 'utf8');
    const resolvedRules = parsed.rules.map((rule) => {
      const prompt = resolvePromptBySource(rule.ruleSource, promptBySource);
      if (!prompt) {
        throw buildUnknownRuleSourceError(rule.ruleSource, validSources);
      }

      return {
        ...rule,
        prompt,
        normalizedRuleSource: normalizeRuleSource(rule.ruleSource),
      };
    });

    const bundledPrompt = buildBundledLintPrompt(
      resolvedRules.map((rule) => ({
        ruleSource: rule.normalizedRuleSource,
        prompt: rule.prompt,
        reviewInstruction: rule.reviewInstruction,
        context: rule.context,
      }))
    );
    const result = await effectiveLintProvider.runPromptStructured<BundledCheckLLMResult>(
      content,
      bundledPrompt,
      buildBundledCheckLLMSchema()
    );
    nestedToolUsage = mergeTokenUsage(nestedToolUsage, result.usage);

    let findingsRecorded = 0;
    for (const finding of result.data.findings) {
      const prompt = resolvePromptBySource(finding.ruleSource, promptBySource);
      if (!prompt) {
        throw buildUnknownRuleSourceError(finding.ruleSource, validSources);
      }

      const wasRecorded = await appendInlineFinding({
        violation: finding,
        reasoning: result.data.reasoning,
        content,
        relFile,
        prompt,
        ruleSource: finding.ruleSource,
        store,
      });
      if (wasRecorded) {
        findingsCount += 1;
        findingsRecorded += 1;
      }
    }

    return {
      ok: true,
      findingsRecorded,
      schema: buildBundledCheckLLMSchema().name,
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
      : [{ file: resolveTargetForTopLevel(workspaceRoot, targets), startLine: 1, endLine: 1 }];

    let findingsRecorded = 0;
    for (const reference of references) {
      const relFile = resolveTargetForTopLevel(workspaceRoot, targets, reference.file);
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

      findingsCount += 1;
      findingsRecorded += 1;
      await store.append({
        eventType: SESSION_EVENT_TYPE.FindingRecordedTopLevel,
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
    const absolutePath = resolveWithinRoot(workspaceRoot, parsed.path);
    const content = await readFile(absolutePath, 'utf8');
    return {
      path: toRelativePathFromRoot(workspaceRoot, absolutePath),
      content,
    };
  }

  async function searchFilesToolHandler(input: unknown): Promise<unknown> {
    const parsed = SEARCH_FILES_INPUT_SCHEMA.parse(input);
    const scope = resolveGlobPatternWithinRoot(workspaceRoot, parsed.pattern);
    const allMatches = await fg(scope.pattern, {
      cwd: scope.cwd,
      dot: false,
      onlyFiles: true,
      absolute: true,
    });

    const truncated = allMatches.length > MAX_SEARCH_FILE_RESULTS;
    const matches = allMatches
      .slice(0, MAX_SEARCH_FILE_RESULTS)
      .map((match) => toRelativePathFromRoot(workspaceRoot, match))
      .sort((a, b) => a.localeCompare(b));

    return { matches, ...(truncated ? { truncated: true } : {}) };
  }

  async function listDirectoryToolHandler(input: unknown): Promise<unknown> {
    const parsed = LIST_DIRECTORY_INPUT_SCHEMA.parse(input);
    const absolutePath = resolveWithinRoot(workspaceRoot, parsed.path);
    const entries = await readdir(absolutePath, { withFileTypes: true });

    return {
      path: toRelativePathFromRoot(workspaceRoot, absolutePath),
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
    const absoluteSearchRoot = resolveWithinRoot(workspaceRoot, parsed.path || '.');
    const globScope = resolveGlobPatternWithinRoot(absoluteSearchRoot, parsed.glob || '**/*');
    const files = await fg(globScope.pattern, {
      cwd: globScope.cwd,
      dot: false,
      onlyFiles: true,
      absolute: true,
    });

    const matches: Array<{ file: string; line: number; text: string }> = [];
    let truncated = false;

    outer: for (const filePath of files) {
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
          if (matches.length >= MAX_CONTENT_MATCH_RESULTS) {
            truncated = true;
            break outer;
          }
          matches.push({
            file: toRelativePathFromRoot(workspaceRoot, filePath),
            line: index + 1,
            text: line,
          });
        }
      }
    }

    return { matches, ...(truncated ? { truncated: true } : {}) };
  }

  async function finalizeReviewToolHandler(input: unknown): Promise<unknown> {
    const parsed = FINALIZE_REVIEW_INPUT_SCHEMA.parse(input);
    if (finalized) {
      throw new AgentToolError(
        'finalize_review can only be called once per session.',
        'FINALIZE_REVIEW_ALREADY_CALLED'
      );
    }
    await store.append({
      eventType: SESSION_EVENT_TYPE.SessionFinalized,
      payload: {
        totalFindings: findingsCount,
        ...(parsed.summary ? { summary: parsed.summary } : {}),
      },
    });
    finalized = true;
    return { ok: true };
  }

  const tools = createAgentTools({
    runTool,
    handlers: {
      lint: lintToolHandler,
      report_finding: reportFindingToolHandler,
      read_file: readFileToolHandler,
      search_files: searchFilesToolHandler,
      list_directory: listDirectoryToolHandler,
      search_content: searchContentToolHandler,
      finalize_review: finalizeReviewToolHandler,
    },
  });
  const availableTools = listAvailableTools(tools);

  let usage: AgentToolLoopResult['usage'] | undefined;
  let requestFailures = 0;
  let hadOperationalErrors = false;
  let errorMessage: string | undefined;

  try {
    const result = await effectiveOrchestratorProvider.runAgentToolLoop({
      systemPrompt: buildAgentSystemPrompt({
        workspaceRoot,
        matchedRuleUnits,
        availableTools,
        userInstructions,
      }),
      prompt: [
        `Workspace root: ${workspaceRoot}`,
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
    requestFailures += 1;
    hadOperationalErrors = true;
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  const events = await store.replay();
  const hasFinalizedEvent = events.some((event) => event.eventType === SESSION_EVENT_TYPE.SessionFinalized);

  if (!hasFinalizedEvent) {
    hadOperationalErrors = true;
    if (!errorMessage) {
      errorMessage = 'Agent run ended without finalize_review.';
    }
  }

  const findings = findingsFromEvents(events);
  const aggregatedUsage = mergeTokenUsage(usage, nestedToolUsage);
  progressReporter?.finishRun(hadOperationalErrors ? 'failed' : 'completed');

  return {
    findings,
    events,
    fileRuleMatches,
    requestFailures,
    hadOperationalErrors,
    ...(errorMessage ? { errorMessage } : {}),
    ...(aggregatedUsage ? { usage: aggregatedUsage } : {}),
  };
}
