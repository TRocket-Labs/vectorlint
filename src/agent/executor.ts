import * as os from 'os';
import type { FilePatternConfig } from '../boundaries/file-section-parser';
import type { PromptFile } from '../prompts/prompt-loader';
import { Severity } from '../evaluators/types';
import type {
  AgentToolDefinition,
  AgentToolLoopResult,
  LLMProvider,
} from '../providers/llm-provider';
import type { ModelCapabilityTier } from '../providers/model-capability';
import type { TokenUsage } from '../providers/token-usage';
import type { OutputFormat } from '../cli/types';
import { createReviewSessionStore } from './review-session-store';
import { buildAgentSystemPrompt } from './prompt-builder';
import { AgentToolError } from '../errors';
import { buildMatchedRuleUnits } from './rule-units';
import {
  createAgentTools,
  listAvailableTools,
  type AgentToolHandler,
  type AgentToolName,
} from './tools-registry';
import {
  LINT_TOOL_INPUT_SCHEMA,
  LIST_DIRECTORY_INPUT_SCHEMA,
  READ_FILE_INPUT_SCHEMA,
  SESSION_EVENT_TYPE,
  type SessionEvent,
} from './types';
import { resolveWithinRoot, toRelativePathFromRoot } from './path-utils';
import type { AgentProgressReporter, VisibleToolName, VisibleToolProgress } from './progress';
import { normalizeRuleSource } from './rule-id';
import { createToolHandlers } from './tool-handlers';
import { findingsFromEvents } from './findings';
import { buildEffectiveRuleBody } from './lint-prompt';
import { resolveMatchedPromptsForFile } from '../rules/matched-prompts';

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
  resolveCapabilityProvider?: (requested: ModelCapabilityTier) => LLMProvider;
  workspaceRoot: string;
  scanPaths: FilePatternConfig[];
  outputFormat: OutputFormat;
  printMode: boolean;
  sessionHomeDir?: string;
  progressReporter?: AgentProgressReporter;
  maxSteps?: number;
  maxRetries?: number;
  maxParallelToolCalls?: number;
  systemDirective?: string;
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

const MATCHED_RULE_UNIT_TOKEN_BUDGET = 800;
const VISIBLE_TOOL_NAMES = new Set<VisibleToolName>(['read_file', 'list_directory', 'lint']);

interface VisibleToolContext extends VisibleToolProgress {
  signature: string;
  progressFile?: string;
}

interface FileRuleMatchBuildResult {
  matches: Array<{ file: string; ruleSource: string }>;
  unmatchedFiles: string[];
}

const NO_CONFIGURATION_FOUND_PREFIX = 'No configuration found for this path:';

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

function resolvePromptBySource(
  ruleSource: string,
  promptBySource: Map<string, PromptFile>
): PromptFile | undefined {
  const normalized = normalizeRuleSource(ruleSource);
  return promptBySource.get(normalized);
}

function isNoConfigurationFoundError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith(NO_CONFIGURATION_FOUND_PREFIX);
}

function withProgressFile<T extends Omit<VisibleToolContext, 'progressFile'> & { progressFile?: string }>(
  context: T,
  progressFile: string | undefined
): VisibleToolContext {
  return progressFile === undefined
    ? context
    : { ...context, progressFile };
}

// Build the concrete matched file-to-rule pairs that the agent should review for this run.
function buildFileRuleMatches(
  relativeTargets: string[],
  prompts: PromptFile[],
  scanPaths: FilePatternConfig[]
): FileRuleMatchBuildResult {
  const matches: Array<{ file: string; ruleSource: string }> = [];
  const unmatchedFiles: string[] = [];

  for (const relFile of relativeTargets) {
    let matchedPrompts: PromptFile[];
    try {
      ({ prompts: matchedPrompts } = resolveMatchedPromptsForFile({
        filePath: relFile,
        prompts,
        scanPaths,
      }));
    } catch (error) {
      if (isNoConfigurationFoundError(error)) {
        unmatchedFiles.push(relFile);
        continue;
      }
      throw error;
    }

    for (const prompt of matchedPrompts) {
      matches.push({ file: relFile, ruleSource: normalizeRuleSource(prompt.fullPath) });
    }
  }

  return { matches, unmatchedFiles };
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
      return withProgressFile({
        toolName: 'read_file',
        path,
        signature: `read_file:${path}`,
      }, resolvedPath && targetFiles.has(resolvedPath)
        ? resolvedPath
        : (currentProgressFile ?? defaultProgressFile));
    }
    case 'list_directory': {
      const parsed = LIST_DIRECTORY_INPUT_SCHEMA.safeParse(input);
      if (!parsed.success) {
        return undefined;
      }
      const resolvedPath = tryResolveRelativePath(workspaceRoot, parsed.data.path);
      const path = resolvedPath ?? parsed.data.path;
      return withProgressFile({
        toolName: 'list_directory',
        path,
        signature: `list_directory:${path}`,
      }, currentProgressFile ?? defaultProgressFile);
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
          const ruleParams = {
            ...(rule.reviewInstruction !== undefined ? { reviewInstruction: rule.reviewInstruction } : {}),
            ...(rule.context !== undefined ? { context: rule.context } : {}),
          };
          return resolvedPrompt
            ? buildEffectiveRuleBody(resolvedPrompt, ruleParams)
            : (rule.reviewInstruction?.trim() || '');
        })
        .join('\n');
      return withProgressFile({
        toolName: 'lint',
        path,
        ruleName: parsed.data.rules.length > 1
          ? `${String(prompt?.meta.name || prompt?.meta.id || 'Rule')} +${parsed.data.rules.length - 1} more`
          : String(prompt?.meta.name || prompt?.meta.id || 'Rule'),
        ruleText,
        signature: `lint:${path}:${parsed.data.rules.map((rule) => normalizeRuleSource(rule.ruleSource)).join(',')}:${ruleText}`,
      }, resolvedPath && targetFiles.has(resolvedPath)
        ? resolvedPath
        : (currentProgressFile ?? defaultProgressFile));
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

export async function runAgentExecutor(params: RunAgentExecutorParams): Promise<AgentExecutorResult> {
  const {
    targets,
    prompts,
    provider,
    resolveCapabilityProvider,
    workspaceRoot,
    scanPaths,
    sessionHomeDir = os.homedir(),
    progressReporter,
    maxSteps,
    maxRetries,
    maxParallelToolCalls,
    systemDirective,
    userInstructions,
  } = params;
  const defaultProvider = provider;
  const effectiveResolveCapabilityProvider = resolveCapabilityProvider
    ?? ((requested: ModelCapabilityTier) => {
      void requested;
      return defaultProvider;
    });

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
  const { matches: fileRuleMatches, unmatchedFiles } = buildFileRuleMatches(relativeTargets, prompts, scanPaths);
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
    const visibleToolContextParams = {
      toolName,
      input,
      workspaceRoot,
      promptBySource,
      targetFiles,
      ...(currentProgressFile !== undefined ? { currentProgressFile } : {}),
      ...(relativeTargets[0] !== undefined ? { defaultProgressFile: relativeTargets[0] } : {}),
    };
    const visibleToolContext = resolveVisibleToolContext(visibleToolContextParams);

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

  const toolState: { tools?: Record<AgentToolName, AgentToolDefinition> } = {};
  const handlers = createToolHandlers({
    workspaceRoot,
    targets,
    promptBySource,
    validSources,
    ...(systemDirective ? { systemDirective } : {}),
    ...(userInstructions ? { userInstructions } : {}),
    defaultProvider,
    resolveCapabilityProvider: effectiveResolveCapabilityProvider,
    store,
    ...(progressReporter ? { progressReporter } : {}),
    getTools: () => toolState.tools,
    buildUnknownRuleSourceError,
    onNestedUsage: (usage) => {
      nestedToolUsage = mergeTokenUsage(nestedToolUsage, usage);
    },
    onFindingRecorded: () => {
      findingsCount += 1;
    },
    getFindingsCount: () => findingsCount,
    isFinalized: () => finalized,
    setFinalized: (value) => {
      finalized = value;
    },
  });

  toolState.tools = createAgentTools({
    runTool,
    handlers,
  });
  const tools = toolState.tools;
  const availableTools = listAvailableTools(tools);

  let usage: AgentToolLoopResult['usage'] | undefined;
  let requestFailures = 0;
  let hadOperationalErrors = unmatchedFiles.length > 0;
  let errorMessage = unmatchedFiles.length > 0
    ? `No scanPaths configuration matched: ${unmatchedFiles.join(', ')}`
    : undefined;

  try {
    const toolLoopParams: Parameters<LLMProvider['runAgentToolLoop']>[0] = {
      systemPrompt: buildAgentSystemPrompt({
        workspaceRoot,
        matchedRuleUnits,
        availableTools,
        ...(userInstructions !== undefined ? { userInstructions } : {}),
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
    };
    const result = await defaultProvider.runAgentToolLoop({
      ...toolLoopParams,
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
