import { readdir, readFile } from 'fs/promises';
import fg from 'fast-glob';
import {
  buildMergedCheckLLMSchema,
  type MergedCheckLLMResult,
} from '../prompts/schema';
import type { PromptFile } from '../prompts/prompt-loader';
import type {
  AgentToolDefinition,
  LLMProvider,
} from '../providers/llm-provider';
import { HIGH_CAPABILITY_TIER, type ModelCapabilityTier } from '../providers/model-capability';
import type { TokenUsage } from '../providers/token-usage';
import { AgentToolError } from '../errors';
import { runSubAgent } from './sub-agent';
import { buildRuleId, normalizeRuleSource } from './rule-id';
import {
  AGENT_TOOL_INPUT_SCHEMA,
  FINALIZE_REVIEW_INPUT_SCHEMA,
  LINT_TOOL_INPUT_SCHEMA,
  LIST_DIRECTORY_INPUT_SCHEMA,
  READ_FILE_INPUT_SCHEMA,
  SEARCH_CONTENT_INPUT_SCHEMA,
  SEARCH_FILES_INPUT_SCHEMA,
  TOP_LEVEL_REPORT_INPUT_SCHEMA,
  SESSION_EVENT_TYPE,
} from './types';
import {
  resolveGlobPatternWithinRoot,
  resolveWithinRoot,
  toRelativePathFromRoot,
} from './path-utils';
import type { AgentProgressReporter } from './progress';
import { appendInlineFinding, severityFromPrompt } from './findings';
import {
  buildMergedLintPrompt,
  type LintRuleCall,
  MERGED_LINT_REVIEW_INSTRUCTIONS,
} from './lint-prompt';
import type { AgentToolHandlers, AgentToolName } from './tools-registry';
import { composeSystemPrompt } from '../prompts/system-prompt';

const MAX_SEARCH_FILE_RESULTS = 500;
const MAX_CONTENT_MATCH_RESULTS = 200;

type ReviewSessionStoreLike = {
  append(entry: {
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
};

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

export interface CreateToolHandlersParams {
  workspaceRoot: string;
  targets: string[];
  promptBySource: Map<string, PromptFile>;
  validSources: string[];
  systemDirective?: string;
  userInstructions?: string;
  defaultProvider: LLMProvider;
  resolveCapabilityProvider: (requested: ModelCapabilityTier) => LLMProvider;
  store: ReviewSessionStoreLike;
  progressReporter?: AgentProgressReporter;
  getTools: () => Record<AgentToolName, AgentToolDefinition> | undefined;
  buildUnknownRuleSourceError: (ruleSource: string, validSources: string[]) => Error;
  onNestedUsage: (usage?: TokenUsage) => void;
  onFindingRecorded: () => void;
  getFindingsCount: () => number;
  isFinalized: () => boolean;
  setFinalized: (value: boolean) => void;
}

export function createToolHandlers(params: CreateToolHandlersParams): AgentToolHandlers {
  const {
    workspaceRoot,
    targets,
    promptBySource,
    validSources,
    systemDirective,
    userInstructions,
    defaultProvider,
    resolveCapabilityProvider,
    store,
    progressReporter,
    getTools,
    buildUnknownRuleSourceError,
    onNestedUsage,
    onFindingRecorded,
    getFindingsCount,
    isFinalized,
    setFinalized,
  } = params;

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
    const allowedRuleSources = Array.from(
      new Set(resolvedRules.map((rule) => rule.normalizedRuleSource))
    ).sort();
    const promptByAllowedRuleSource = new Map(
      resolvedRules.map((rule) => [rule.normalizedRuleSource, rule.prompt] as const)
    );

    const mergedRuleCalls: LintRuleCall[] = resolvedRules.map((rule) => ({
      ruleSource: rule.normalizedRuleSource,
      prompt: rule.prompt,
      reviewInstruction: rule.reviewInstruction,
      context: rule.context,
    }));

    const mergedPrompt = buildMergedLintPrompt(mergedRuleCalls);
    const lintPrompt = [
      ...MERGED_LINT_REVIEW_INSTRUCTIONS,
      '',
      mergedPrompt,
    ].join('\n').trim();
    const systemPrompt = composeSystemPrompt({
      instructions: lintPrompt,
      ...(systemDirective ? { directive: systemDirective } : {}),
      ...(userInstructions ? { userInstructions } : {}),
    });
    const lintProvider = parsed.model
      ? resolveCapabilityProvider(parsed.model)
      : defaultProvider;
    const result = await lintProvider.runPromptStructured<MergedCheckLLMResult>(
      systemPrompt,
      content,
      buildMergedCheckLLMSchema()
    );
    onNestedUsage(result.usage);

    let findingsRecorded = 0;
    for (const finding of result.data.findings) {
      const normalizedRuleSource = normalizeRuleSource(finding.ruleSource);
      const prompt = promptByAllowedRuleSource.get(normalizedRuleSource);
      if (!prompt) {
        throw buildUnknownRuleSourceError(finding.ruleSource, allowedRuleSources);
      }

      const wasRecorded = await appendInlineFinding({
        violation: finding,
        reasoning: result.data.reasoning,
        content,
        relFile,
        prompt,
        ruleSource: normalizedRuleSource,
        store,
      });
      if (wasRecorded) {
        onFindingRecorded();
        findingsRecorded += 1;
      }
    }

    return {
      ok: true,
      findingsRecorded,
      schema: buildMergedCheckLLMSchema().name,
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
      onFindingRecorded();
      findingsRecorded += 1;
      await store.append({
        eventType: SESSION_EVENT_TYPE.FindingRecordedTopLevel,
        payload: {
          file: relFile,
          line: Math.max(1, Math.trunc(reference.startLine)),
          column: 1,
          severity: severityFromPrompt(prompt),
          ruleId: buildRuleId(prompt),
          ruleSource: normalizeRuleSource(parsed.ruleSource),
          message: parsed.message,
          ...(parsed.suggestion ? { suggestion: parsed.suggestion } : {}),
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

  async function agentToolHandler(input: unknown): Promise<unknown> {
    const parsed = AGENT_TOOL_INPUT_SCHEMA.parse(input);
    const subAgentProvider = resolveCapabilityProvider(parsed.model ?? HIGH_CAPABILITY_TIER);
    const tools = getTools();
    if (!tools) {
      throw new AgentToolError('Agent tools not initialized.', 'TOOLS_NOT_INITIALIZED');
    }

    const result = await runSubAgent({
      provider: subAgentProvider,
      task: parsed.task,
      workspaceRoot,
      ...(parsed.label ? { label: parsed.label } : {}),
      ...(progressReporter ? { progressReporter } : {}),
      tools: {
        read_file: tools.read_file,
        search_files: tools.search_files,
        list_directory: tools.list_directory,
        search_content: tools.search_content,
      },
    });
    onNestedUsage(result.usage);
    return result;
  }

  async function finalizeReviewToolHandler(input: unknown): Promise<unknown> {
    const parsed = FINALIZE_REVIEW_INPUT_SCHEMA.parse(input);
    if (isFinalized()) {
      throw new AgentToolError(
        'finalize_review can only be called once per session.',
        'FINALIZE_REVIEW_ALREADY_CALLED'
      );
    }
    await store.append({
      eventType: SESSION_EVENT_TYPE.SessionFinalized,
      payload: {
        totalFindings: getFindingsCount(),
        ...(parsed.summary ? { summary: parsed.summary } : {}),
      },
    });
    setFinalized(true);
    return { ok: true };
  }

  return {
    agent: agentToolHandler,
    lint: lintToolHandler,
    report_finding: reportFindingToolHandler,
    read_file: readFileToolHandler,
    search_files: searchFilesToolHandler,
    list_directory: listDirectoryToolHandler,
    search_content: searchContentToolHandler,
    finalize_review: finalizeReviewToolHandler,
  };
}
