import { readFileSync } from 'fs';
import { readFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as os from 'os';
import type { PromptFile } from '../prompts/prompt-loader';
import { ScanPathResolver } from '../boundaries/scan-path-resolver';
import { ValeJsonFormatter, type JsonIssue } from '../output/vale-json-formatter';
import { JsonFormatter, type Issue } from '../output/json-formatter';
import { RdJsonFormatter } from '../output/rdjson-formatter';
import { printFileHeader, printIssueRow, printEvaluationSummaries, type EvaluationSummary } from '../output/reporter';
import { isJudgeResult } from '../prompts/schema';
import { handleUnknownError, MissingDependencyError } from '../errors/index';
import { processFindings } from '../findings';
import { createEvaluator } from '../evaluators/index';
import { Type, Severity } from '../evaluators/types';
import { USER_INSTRUCTION_FILENAME } from '../config/constants';
import { AGENT_REVIEW_MODE, DEFAULT_REVIEW_MODE, OutputFormat } from './types';
import { runAgentExecutor, type AgentExecutorResult, type AgentFinding } from '../agent/executor';
import { AgentProgressReporter, shouldEmitAgentProgress } from '../agent/progress';
import type {
  EvaluationOptions, EvaluationResult, ErrorTrackingResult,
  ReportIssueParams, ProcessPromptResultParams,
  RunPromptEvaluationParams, RunPromptEvaluationResult, EvaluateFileParams, EvaluateFileResult,
  RunPromptEvaluationResultSuccess
} from './types';
import {
  calculateCost,
  TokenUsageStats
} from '../providers/token-usage';
import { calculateCheckScore } from '../scoring';
import { countWords } from '../chunking/utils';
import { buildRuleId, normalizeRuleSource } from '../agent/rule-id';
import {
  computeFilterDecision,
  type FilterDecision,
} from "../evaluators/violation-filter";
import { writeDebugRunArtifact } from "../debug/run-artifact";

function getModelInfoFromEnv(): { provider?: string; name?: string; tag?: string } {
  const provider = process.env.LLM_PROVIDER;
  let name: string | undefined;

  switch (provider) {
    case "openai":
      name = process.env.OPENAI_MODEL;
      break;
    case "anthropic":
      name = process.env.ANTHROPIC_MODEL;
      break;
    case "azure-openai":
      name = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
      break;
    case "gemini":
      name = process.env.GEMINI_MODEL;
      break;
  }

  const tag = [provider, name].filter(Boolean).join("-");
  return { ...(provider && { provider }), ...(name && { name }), ...(tag && { tag }) };
}


/*
 * Generic concurrency runner that executes workers in parallel up to a specified limit.
 * Preserves result order matching input order.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let i = 0;
  const workers = new Array(Math.min(limit, items.length))
    .fill(0)
    .map(async () => {
      while (true) {
        const idx = i++;
        if (idx >= items.length) break;
        const item = items[idx];
        if (item !== undefined) {
          results[idx] = await worker(item, idx);
        }
      }
    });
  await Promise.all(workers);
  return results;
}

/*
 * Reports an issue in either line or JSON format.
 */
function reportIssue(params: ReportIssueParams): void {
  const {
    file,
    line,
    column,
    severity,
    summary,
    ruleName,
    outputFormat,
    jsonFormatter,
    analysis,
    suggestion,
    fix,
    scoreText,
    match,
  } = params;

  if (outputFormat === OutputFormat.Line) {
    const locStr = `${line}:${column}`;
    printIssueRow(
      locStr,
      severity,
      summary,
      ruleName,
      suggestion ? { suggestion } : {}
    );
  } else if (outputFormat === OutputFormat.ValeJson) {
    const issue: JsonIssue = {
      file,
      line,
      column,
      severity,
      message: summary,
      rule: ruleName,
      match: match || "",
      matchLength: match ? match.length : 0,
      ...(suggestion !== undefined ? { suggestion } : {}),
      ...(fix !== undefined ? { fix } : {}),
      ...(scoreText !== undefined ? { score: scoreText } : {}),
    };
    (jsonFormatter as ValeJsonFormatter).addIssue(issue);
  } else if (
    outputFormat === OutputFormat.Json ||
    outputFormat === OutputFormat.RdJson
  ) {
    const matchLen = match ? match.length : 0;
    const endColumn = column + matchLen;
    const issue: Issue = {
      line,
      column,
      span: [column, endColumn],
      severity,
      message: summary,
      rule: ruleName,
      match: match || "",
      ...(analysis ? { analysis } : {}),
      ...(suggestion ? { suggestion } : {}),
      ...(fix ? { fix } : {}),
    };
    (jsonFormatter as JsonFormatter | RdJsonFormatter).addIssue(file, issue);
  }
}

function getViolationFilterResults<
  TViolation extends Parameters<typeof computeFilterDecision>[0]
>(
  violations: TViolation[]
): {
  decisions: FilterDecision[];
  surfacedViolations: TViolation[];
} {
  const decisions = violations.map((v) => computeFilterDecision(v));
  const surfacedViolations = violations.filter(
    (_v, i) => decisions[i]?.surface === true
  );

  return { decisions, surfacedViolations };
}

/*
 * Routes an evaluation result through the shared finding processor.
 * Check results are verified, filtered, scored, and reported; judge/rubric
 * results are rejected (Phase 3) because subjective scoring is not a
 * future-facing review type.
 */
function routePromptResult(
  params: ProcessPromptResultParams
): ErrorTrackingResult {
  const {
    promptFile,
    result,
    content,
    relFile,
    outputFormat,
    jsonFormatter,
    verbose,
    debugJson,
  } = params;
  const meta = promptFile.meta;
  const promptId = (meta.id || "").toString();

  // Handle Check Result — routed through the shared finding processor
  // (Phase 3, audit Findings #4 and #6). The processor verifies evidence,
  // filters, deduplicates, scores, and resolves severity; the orchestrator
  // only feeds the returned ReviewResult to the existing formatter sinks.
  if (!isJudgeResult(result)) {
    const reviewResult = processFindings({
      pack: promptFile.pack,
      ruleId: promptId,
      ruleSource: promptFile.fullPath,
      candidateFindings: result.violations,
      wordCount: result.word_count,
      promptMeta: {
        ...(meta.severity !== undefined ? { severity: meta.severity } : {}),
        ...(meta.strictness !== undefined ? { strictness: meta.strictness } : {}),
        // Sanitize to the findings contract ({ id, name }): meta.criteria is
        // PromptCriterionSpec[], which can carry legacy rubric weight/target.
        ...(meta.criteria
          ? { criteria: meta.criteria.map((c) => ({ id: c.id, name: c.name })) }
          : {}),
      },
      targetContent: content,
    });

    // processFindings always returns exactly one score entry (processor contract).
    const ruleScore = reviewResult.scores[0]!;
    const severity =
      ruleScore.severity === 'error' ? Severity.ERROR : Severity.WARNING;

    // Report only verified findings through the existing line/json/rdjson/vale sink.
    for (const finding of reviewResult.findings) {
      reportIssue({
        file: relFile,
        line: finding.line,
        column: finding.column,
        severity,
        summary: finding.message,
        ruleName: finding.ruleId,
        outputFormat,
        jsonFormatter,
        ...(finding.analysis !== undefined ? { analysis: finding.analysis } : {}),
        ...(finding.suggestion !== undefined ? { suggestion: finding.suggestion } : {}),
        ...(finding.fix !== undefined ? { fix: finding.fix } : {}),
        match: finding.match,
      });
    }

    // Diagnostics (e.g. finding-evidence-not-locatable) surface in verbose mode,
    // consistent with prior operational reporting. They are warn-level and do not
    // flag the run as operationally failed (audit Finding #6).
    if (verbose) {
      for (const diagnostic of reviewResult.diagnostics) {
        console.warn(`[vectorlint] ${diagnostic.message}`);
      }
    }

    // Verified finding count drives the counts (audit Finding #6).
    const findingCount = reviewResult.findings.length;
    const totalErrors = severity === Severity.ERROR ? findingCount : 0;
    const totalWarnings = severity === Severity.ERROR ? 0 : findingCount;

    const scoreEntry: EvaluationSummary = {
      id: ruleScore.ruleId,
      scoreText: ruleScore.scoreText,
      score: ruleScore.score,
    };

    if (debugJson) {
      const { decisions, surfacedViolations } = getViolationFilterResults(
        result.violations
      );
      const runId = randomUUID();
      const model = getModelInfoFromEnv();

      try {
        const filePath = writeDebugRunArtifact(process.cwd(), runId, {
          file: relFile,
          ...(Object.keys(model).length > 0 ? { model } : {}),
          ...(model.tag !== undefined ? { subdir: model.tag } : {}),
          prompt: {
            pack: promptFile.pack,
            id: promptId,
            filename: promptFile.filename,
            evaluation_type: "check",
          },
          raw_model_output: (result as { raw_model_output?: unknown }).raw_model_output ?? null,
          filter_decisions: decisions.map((d, i) => ({
            index: i,
            surface: d.surface,
            reasons: d.reasons,
          })),
          surfaced_violations: surfacedViolations,
        });
        console.warn(`[vectorlint] Debug JSON written: ${filePath}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[vectorlint] Debug JSON write failed: ${message}`);
      }
    }

    return {
      errors: totalErrors,
      warnings: totalWarnings,
      hadOperationalErrors: reviewResult.hadOperationalErrors ?? false,
      hadSeverityErrors: severity === Severity.ERROR && totalErrors > 0,
      scoreEntries: [scoreEntry],
    };
  }

  // Judge/rubric reviews are not a future-facing review type (Phase 3). The
  // prompt-meta boundary rejects `type: judge`, so a JudgeResult here means a
  // caller bypassed that boundary. Refuse it explicitly rather than
  // misprojecting it as a check result. No adapter is added for judge metadata.
  if (verbose) {
    console.warn(
      '[vectorlint] Judge/rubric review results are no longer supported; skipping prompt.'
    );
  }
  return {
    errors: 0,
    warnings: 0,
    hadOperationalErrors: true,
    hadSeverityErrors: false,
    scoreEntries: [],
  };
}

/*
 * Runs a single prompt evaluation.
 * BaseEvaluator auto-detects mode from criteria presence:
 * - criteria defined → scored mode
 * - no criteria → basic mode
 */
async function runPromptEvaluation(
  params: RunPromptEvaluationParams
): Promise<RunPromptEvaluationResult> {
  const { promptFile, relFile, content, provider, searchProvider } = params;

  try {
    const meta = promptFile.meta;

    const evaluatorType = String(meta.evaluator || Type.BASE);
    const baseEvaluatorType = String(Type.BASE);

    // Specialized evaluators (e.g., technical-accuracy) require criteria
    // BaseEvaluator handles both modes: scored (with criteria) and basic (without)
    if (evaluatorType !== baseEvaluatorType) {
      if (
        !meta ||
        !Array.isArray(meta.criteria) ||
        meta.criteria.length === 0
      ) {
        throw new Error(
          `Prompt ${promptFile.filename} has no criteria in frontmatter`
        );
      }
    }
    const evaluator = createEvaluator(
      evaluatorType,
      provider,
      promptFile,
      searchProvider
    );
    const result = await evaluator.evaluate(relFile, content);


    const resultObj: RunPromptEvaluationResultSuccess = { ok: true, result };

    return resultObj;
  } catch (e: unknown) {
    const err = handleUnknownError(e, `Running prompt ${promptFile.filename}`);
    return { ok: false, error: err };
  }
}

/*
 * Evaluates a single file with all applicable prompts.
 */
async function evaluateFile(
  params: EvaluateFileParams
): Promise<EvaluateFileResult> {
  const { file, options, jsonFormatter } = params;
  const {
    prompts,
    provider,
    searchProvider,
    concurrency,
    scanPaths,
    outputFormat = OutputFormat.Line,
    verbose,
    debugJson,
  } = options;

  let hadOperationalErrors = false;
  let hadSeverityErrors = false;
  let totalErrors = 0;
  let totalWarnings = 0;
  let requestFailures = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const allScores = new Map<string, EvaluationSummary[]>();

  const content = readFileSync(file, "utf-8");
  const relFile = path.relative(process.cwd(), file) || file;

  if (outputFormat === OutputFormat.Line) {
    printFileHeader(relFile);
  }

  // Determine applicable prompts for this file
  const toRun: PromptFile[] = [];

  if (scanPaths && scanPaths.length > 0) {
    const resolver = new ScanPathResolver();
    // Extract available packs from loaded prompts
    const availablePacks = Array.from(
      new Set(prompts.map((p) => p.pack).filter((p): p is string => !!p))
    );

    const resolution = resolver.resolveConfiguration(
      relFile,
      scanPaths,
      availablePacks
    );

    // Filter prompts by active packs - only runs if explicitly in RunRules
    const activePrompts = prompts.filter((p) => {
      // Prompts with empty pack (style guide only) always run
      if (p.pack === '') return true;
      if (!p.pack || !resolution.packs.includes(p.pack)) return false;
      if (!p.meta?.id) return true;
      const disableKey = `${p.pack}.${p.meta.id}`;
      const overrideValue = resolution.overrides[disableKey];
      return (
        typeof overrideValue !== "string" ||
        overrideValue.toLowerCase() !== "disabled"
      );
    });

    toRun.push(...activePrompts);
  } else {
    // Fallback: When no scanPaths configured, run all prompts.
    toRun.push(...prompts);
  }

  // If no rules matched but VECTORLINT.md exists, run an evaluation using it.
  // The LLM will use the VECTORLINT.md content from the system prompt.
  if (options.userInstructionContent) {
    toRun.push({
      id: USER_INSTRUCTION_FILENAME,
      filename: USER_INSTRUCTION_FILENAME,
      fullPath: USER_INSTRUCTION_FILENAME,
      pack: '',
      body: '',
      meta: {
        id: USER_INSTRUCTION_FILENAME,
        name: USER_INSTRUCTION_FILENAME,
        severity: Severity.WARNING,
      },
    });
  }

  const results = await runWithConcurrency(
    toRun,
    concurrency,
    async (prompt) => {
      return runPromptEvaluation({
        promptFile: prompt,
        relFile,
        content,
        provider,
        ...(searchProvider !== undefined && { searchProvider }),
      });
    }
  );

  // Aggregate results from each prompt
  for (let idx = 0; idx < toRun.length; idx++) {
    const p = toRun[idx];
    const r = results[idx];
    if (!p || !r) continue;

    if (r.ok !== true) {
      // Check if this is a missing dependency error - if so, skip gracefully
      if (r.error instanceof MissingDependencyError) {
        console.warn(`[vectorlint] Skipping ${p.filename}: ${r.error.message}`);
        if (r.error.hint) {
          console.warn(`[vectorlint] Hint: ${r.error.hint}`);
        }
        // Skip this evaluation entirely - don't count it as a failure
        continue;
      }

      // Other errors are actual failures
      console.error(`  Prompt failed: ${p.filename}`);
      console.error(r.error);
      hadOperationalErrors = true;
      requestFailures += 1;
      continue;
    }

    // Accumulate token usage
    if (r.result.usage) {
      totalInputTokens += r.result.usage.inputTokens;
      totalOutputTokens += r.result.usage.outputTokens;
    }

    const promptResult = routePromptResult({
      promptFile: p,
      result: r.result,
      content,
      relFile,
      outputFormat,
      jsonFormatter,
      verbose,
      ...(debugJson !== undefined ? { debugJson } : {}),
    });
    totalErrors += promptResult.errors;
    totalWarnings += promptResult.warnings;
    hadOperationalErrors =
      hadOperationalErrors || promptResult.hadOperationalErrors;
    hadSeverityErrors = hadSeverityErrors || promptResult.hadSeverityErrors;

    if (promptResult.scoreEntries && promptResult.scoreEntries.length > 0) {
      const ruleName = (p.meta.id || p.filename).toString();
      allScores.set(ruleName, promptResult.scoreEntries);
    }
  }

  const tokenUsageStats: TokenUsageStats = {
    totalInputTokens,
    totalOutputTokens,
  };

  if (outputFormat === OutputFormat.Line) {
    printEvaluationSummaries(allScores);
    console.log("");
  }

  return {
    errors: totalErrors,
    warnings: totalWarnings,
    requestFailures,
    hadOperationalErrors,
    hadSeverityErrors,
    tokenUsage: tokenUsageStats
  };
}

function reportAgentFinding(params: {
  finding: AgentFinding;
  outputFormat: OutputFormat;
  jsonFormatter: ValeJsonFormatter | JsonFormatter | RdJsonFormatter;
}): void {
  const { finding, outputFormat, jsonFormatter } = params;

  reportIssue({
    file: finding.file,
    line: finding.line,
    column: finding.column,
    severity: finding.severity,
    summary: finding.message,
    ruleName: finding.ruleId,
    outputFormat,
    jsonFormatter,
    ...(finding.analysis ? { analysis: finding.analysis } : {}),
    ...(finding.suggestion ? { suggestion: finding.suggestion } : {}),
    ...(finding.fix ? { fix: finding.fix } : {}),
    ...(finding.match ? { match: finding.match } : {}),
  });
}

type AgentRuleScore = {
  ruleId: string;
  score: number;
  scoreText: string;
};

async function getAgentFileWordCount(
  file: string,
  workspaceRoot: string,
  cache: Map<string, number>
): Promise<number> {
  const workspaceRelative = path.relative(workspaceRoot, path.resolve(workspaceRoot, file)) || file;
  if (cache.has(workspaceRelative)) {
    return cache.get(workspaceRelative)!;
  }

  const absolutePath = path.resolve(workspaceRoot, workspaceRelative);
  try {
    const content = await readFile(absolutePath, 'utf-8');
    const words = Math.max(1, countWords(content) || 1);
    cache.set(workspaceRelative, words);
    return words;
  } catch {
    cache.set(workspaceRelative, 1);
    return 1;
  }
}

async function buildAgentRuleScores(
  findings: AgentFinding[],
  prompts: PromptFile[],
  fileRuleMatches: Array<{ file: string; ruleSource: string }>,
  workspaceRoot: string
): Promise<AgentRuleScore[]> {
  const fileWordCountCache = new Map<string, number>();
  const findingsByRule = new Map<string, AgentFinding[]>();
  const filesByRuleSource = new Map<string, Set<string>>();

  for (const finding of findings) {
    const existing = findingsByRule.get(finding.ruleId) ?? [];
    existing.push(finding);
    findingsByRule.set(finding.ruleId, existing);
  }
  for (const match of fileRuleMatches) {
    const files = filesByRuleSource.get(match.ruleSource) ?? new Set<string>();
    files.add(match.file);
    filesByRuleSource.set(match.ruleSource, files);
  }

  const results: AgentRuleScore[] = [];
  for (const prompt of prompts) {
    const ruleId = buildRuleId(prompt);
    const ruleFindings = findingsByRule.get(ruleId) ?? [];
    const matchedFiles = filesByRuleSource.get(normalizeRuleSource(prompt.fullPath)) ?? new Set<string>();

    if (matchedFiles.size === 0) {
      results.push({
        ruleId,
        score: 10,
        scoreText: '10.0/10',
      });
      continue;
    }

    let totalWords = 0;
    for (const file of matchedFiles) {
      totalWords += await getAgentFileWordCount(file, workspaceRoot, fileWordCountCache);
    }

    const syntheticViolations = Array.from({ length: ruleFindings.length }, (_, index) => ({
      line: index + 1,
      description: 'Agent finding',
      analysis: 'Agent finding',
    }));

    const scored = calculateCheckScore(
      syntheticViolations,
      Math.max(1, totalWords),
      {
        strictness: prompt.meta.strictness,
        promptSeverity: prompt.meta.severity,
      }
    );

    results.push({
      ruleId,
      score: scored.final_score,
      scoreText: `${scored.final_score.toFixed(1)}/10`,
    });
  }
  return results;
}

// Retained in quarantine: the unreleased internal agent-mode implementation is
// unreachable from the CLI because --mode agent falls back to standard evaluation.
// Removed in Phase 4.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- intentional quarantine
async function evaluateFilesInAgentMode(
  targets: string[],
  options: EvaluationOptions,
  outputFormat: OutputFormat,
  jsonFormatter: ValeJsonFormatter | JsonFormatter | RdJsonFormatter
): Promise<EvaluationResult> {
  const workspaceRoot = inferAgentWorkspaceRoot(targets);
  const progressReporter = new AgentProgressReporter(
    shouldEmitAgentProgress({
      outputFormat,
      printMode: options.printMode ?? false,
    })
  );

  const agentResult: AgentExecutorResult = await runAgentExecutor({
    targets,
    prompts: options.prompts,
    provider: options.provider,
    workspaceRoot,
    scanPaths: options.scanPaths,
    outputFormat,
    printMode: options.printMode ?? false,
    sessionHomeDir: os.homedir(),
    progressReporter,
    maxParallelToolCalls: 3,
    maxRetries: options.agentMaxRetries ?? 10,
    ...(options.userInstructionContent ? { userInstructions: options.userInstructionContent } : {}),
  });

  let totalErrors = 0;
  let totalWarnings = 0;
  const printedFileHeaders = new Set<string>();
  for (const finding of agentResult.findings) {
    if (outputFormat === OutputFormat.Line && !printedFileHeaders.has(finding.file)) {
      printFileHeader(finding.file);
      printedFileHeaders.add(finding.file);
    }
    reportAgentFinding({ finding, outputFormat, jsonFormatter });
    if (finding.severity === Severity.ERROR) {
      totalErrors += 1;
    } else {
      totalWarnings += 1;
    }
  }

  if (outputFormat === OutputFormat.Line) {
    const ruleScores = await buildAgentRuleScores(
      agentResult.findings,
      options.prompts,
      agentResult.fileRuleMatches,
      workspaceRoot
    );
    const scoreSummary = new Map<string, EvaluationSummary[]>(
      ruleScores.map((entry) => [
        entry.ruleId,
        [{ id: 'overall', scoreText: entry.scoreText, score: entry.score }],
      ])
    );
    printEvaluationSummaries(scoreSummary);

    if (agentResult.hadOperationalErrors) {
      const message = agentResult.errorMessage ?? 'Agent run encountered an operational error.';
      console.error(`\n[agent] ${message}`);
    }
  }

  if (
    outputFormat === OutputFormat.Json ||
    outputFormat === OutputFormat.ValeJson ||
    outputFormat === OutputFormat.RdJson
  ) {
    console.log(jsonFormatter.toJson());
  }

  const tokenUsage = {
    totalInputTokens: agentResult.usage?.inputTokens ?? 0,
    totalOutputTokens: agentResult.usage?.outputTokens ?? 0,
  };

  return {
    totalFiles: targets.length,
    totalErrors,
    totalWarnings,
    requestFailures: agentResult.requestFailures,
    hadOperationalErrors: agentResult.hadOperationalErrors,
    hadSeverityErrors: totalErrors > 0,
    tokenUsage,
  };
}

function inferAgentWorkspaceRoot(targets: string[]): string {
  if (targets.length === 0) {
    return process.cwd();
  }

  const directories = targets.map((target) => path.dirname(path.resolve(target)));
  let root = directories[0]!;

  for (const directory of directories.slice(1)) {
    root = commonPathPrefix(root, directory);
  }

  return root;
}

function commonPathPrefix(left: string, right: string): string {
  let candidate = path.resolve(left);
  const target = path.resolve(right);

  while (true) {
    const relative = path.relative(candidate, target);
    const insideCandidate = !relative.startsWith('..') && !path.isAbsolute(relative);
    if (insideCandidate) {
      return candidate;
    }

    const parent = path.dirname(candidate);
    if (parent === candidate) {
      return candidate;
    }
    candidate = parent;
  }
}

/*
 * Runs evaluations across all target files with configurable concurrency.
 * Coordinates prompt-to-file mapping, evaluation execution, and result aggregation.
 * Returns aggregated results for reporting.
 */
export async function evaluateFiles(
  targets: string[],
  options: EvaluationOptions
): Promise<EvaluationResult> {
  const { outputFormat = OutputFormat.Line, mode = DEFAULT_REVIEW_MODE } = options;

  let hadOperationalErrors = false;
  let hadSeverityErrors = false;
  let totalFiles = 0;
  let totalErrors = 0;
  let totalWarnings = 0;
  let requestFailures = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  let jsonFormatter: ValeJsonFormatter | JsonFormatter | RdJsonFormatter;
  if (outputFormat === OutputFormat.Json) {
    jsonFormatter = new JsonFormatter();
  } else if (outputFormat === OutputFormat.RdJson) {
    jsonFormatter = new RdJsonFormatter();
  } else {
    jsonFormatter = new ValeJsonFormatter();
  }

  if (mode === AGENT_REVIEW_MODE) {
    options.logger?.warn(
      '--mode agent is an unreleased internal path and now falls back to standard mode. ' +
        'See docs/audits/2026-07-10-vectorlint-harness-architecture-audit.md.',
    );
    // Fall through to standard evaluation; do not call evaluateFilesInAgentMode.
  }

  for (const file of targets) {
    try {
      totalFiles += 1;
      const fileResult = await evaluateFile({ file, options, jsonFormatter });
      totalErrors += fileResult.errors;
      totalWarnings += fileResult.warnings;
      requestFailures += fileResult.requestFailures;
      hadOperationalErrors =
        hadOperationalErrors || fileResult.hadOperationalErrors;
      hadSeverityErrors = hadSeverityErrors || fileResult.hadSeverityErrors;

      // Aggregate token usage
      if (fileResult.tokenUsage) {
        totalInputTokens += fileResult.tokenUsage.totalInputTokens;
        totalOutputTokens += fileResult.tokenUsage.totalOutputTokens;
      }
    } catch (e: unknown) {
      const err = handleUnknownError(e, `Processing file ${file}`);
      console.error(`Error processing file ${file}: ${err.message}`);
      hadOperationalErrors = true;
    }
  }

  // Output results based on format (always to stdout for JSON formats)
  if (
    outputFormat === OutputFormat.Json ||
    outputFormat === OutputFormat.ValeJson ||
    outputFormat === OutputFormat.RdJson
  ) {
    const jsonStr = jsonFormatter.toJson();
    console.log(jsonStr);
  }

  // Calculate aggregated token usage stats
  const tokenUsage: TokenUsageStats = {
    totalInputTokens,
    totalOutputTokens,
  };

  // Calculate cost if pricing is configured
  const cost = calculateCost({
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens
  }, options.pricing);
  if (cost !== undefined) {
    tokenUsage.totalCost = cost;
  }

  return {
    totalFiles,
    totalErrors,
    totalWarnings,
    requestFailures,
    hadOperationalErrors,
    hadSeverityErrors,
    tokenUsage,
  };
}
