import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type { PromptFile } from '../prompts/prompt-loader';
import { ScanPathResolver } from '../boundaries/scan-path-resolver';
import { ValeJsonFormatter, type JsonIssue } from '../output/vale-json-formatter';
import { JsonFormatter, type Issue } from '../output/json-formatter';
import { RdJsonFormatter } from '../output/rdjson-formatter';
import { printFileHeader, printIssueRow, printEvaluationSummaries, type EvaluationSummary } from '../output/reporter';
import { handleUnknownError } from '../errors/index';
import { USER_INSTRUCTION_FILENAME } from '../config/constants';
import { OutputFormat } from './types';
import { executorFor } from '../executors';
import { chooseModelCall } from '../review/executor';
import { buildReviewRequest } from '../review/request-builder';
import type { ReviewResult, ReviewSeverity, ReviewTarget } from '../review/types';
import type {
  EvaluationOptions, EvaluationResult, ReportIssueParams, EvaluateFileResult,
} from './types';
import {
  calculateCost,
  TokenUsageStats
} from '../providers/token-usage';
import { writeDebugRunArtifact } from '../debug/run-artifact';
import { Severity } from '../evaluators/types';

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

function toSeverity(severity: ReviewSeverity): Severity {
  return severity === 'error' ? Severity.ERROR : Severity.WARNING;
}

function contentTypeFor(file: string): string {
  return path.extname(file).toLowerCase() === '.md' ? 'text/markdown' : 'text/plain';
}

function emptyTokenUsage(): TokenUsageStats {
  return { totalInputTokens: 0, totalOutputTokens: 0 };
}

/*
 * Writes a debug JSON artifact for a review run. The executor path reviews
 * through the shared finding processor, so raw model output and per-candidate
 * filter decisions are no longer reachable here; the artifact records the
 * verified findings that surfaced and the review metadata instead.
 */
function writeReviewDebugArtifact(relFile: string, result: ReviewResult): void {
  const runId = randomUUID();
  const model = getModelInfoFromEnv();
  try {
    const filePath = writeDebugRunArtifact(process.cwd(), runId, {
      file: relFile,
      ...(Object.keys(model).length > 0 ? { model } : {}),
      ...(model.tag !== undefined ? { subdir: model.tag } : {}),
      prompt: {},
      raw_model_output: null,
      filter_decisions: [],
      surfaced_violations: result.findings,
    });
    console.warn(`[vectorlint] Debug JSON written: ${filePath}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[vectorlint] Debug JSON write failed: ${message}`);
  }
}

/*
 * Determines the source-backed prompts that apply to a file, honoring the
 * configured scan paths. When no rules match but a VECTORLINT.md user
 * instruction guide exists, a synthetic rule is added so the reviewer model
 * evaluates against the user instructions in the system prompt.
 */
function resolveApplicablePrompts(
  relFile: string,
  prompts: PromptFile[],
  scanPaths: EvaluationOptions['scanPaths'],
  userInstructionContent: string | undefined,
): PromptFile[] {
  const toRun: PromptFile[] = [];

  if (scanPaths && scanPaths.length > 0) {
    const resolver = new ScanPathResolver();
    const availablePacks = Array.from(
      new Set(prompts.map((p) => p.pack).filter((p): p is string => !!p))
    );

    const resolution = resolver.resolveConfiguration(
      relFile,
      scanPaths,
      availablePacks
    );

    const activePrompts = prompts.filter((p) => {
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
    toRun.push(...prompts);
  }

  if (userInstructionContent) {
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

  return toRun;
}

/*
 * Evaluates a single file: builds a ReviewRequest from the applicable
 * source-backed prompts, resolves the model-call strategy, dispatches through
 * the selected ReviewExecutor, and routes the resulting ReviewResult to the
 * existing line/json/vale output sinks.
 */
async function evaluateFile(
  file: string,
  options: EvaluationOptions,
  jsonFormatter: ValeJsonFormatter | JsonFormatter | RdJsonFormatter,
): Promise<EvaluateFileResult> {
  const {
    prompts,
    scanPaths,
    outputFormat = OutputFormat.Line,
    verbose,
    debugJson,
  } = options;

  const allScores = new Map<string, EvaluationSummary[]>();

  const content = readFileSync(file, "utf-8");
  const relFile = path.relative(process.cwd(), file) || file;

  if (outputFormat === OutputFormat.Line) {
    printFileHeader(relFile);
  }

  const toRun = resolveApplicablePrompts(
    relFile,
    prompts,
    scanPaths,
    options.userInstructionContent,
  );

  // No applicable rules: nothing to review for this file.
  if (toRun.length === 0) {
    if (outputFormat === OutputFormat.Line) {
      printEvaluationSummaries(allScores);
      console.log("");
    }
    return {
      errors: 0,
      warnings: 0,
      requestFailures: 0,
      hadOperationalErrors: false,
      hadSeverityErrors: false,
      tokenUsage: emptyTokenUsage(),
    };
  }

  const target: ReviewTarget = {
    uri: pathToFileURL(path.resolve(file)).href,
    content,
    contentType: contentTypeFor(file),
    byteLength: Buffer.byteLength(content),
  };
  const request = buildReviewRequest({
    target,
    prompts: toRun,
    config: { modelCall: options.modelCall },
  });
  const resolvedModelCall = chooseModelCall(request.modelCall, {
    targetBytes: request.target.byteLength ?? Buffer.byteLength(content),
    rules: request.rules.length,
  });
  const executor = executorFor(resolvedModelCall, {
    structuredModelClient: options.provider,
    toolCallingModelClient: options.provider,
    builder: options.requestBuilder,
  });

  let result: ReviewResult;
  try {
    result = await executor.run(request);
  } catch (e: unknown) {
    const err = handleUnknownError(e, `Reviewing ${relFile}`);
    console.error(`Error reviewing file ${relFile}: ${err.message}`);
    return {
      errors: 0,
      warnings: 0,
      requestFailures: 1,
      hadOperationalErrors: true,
      hadSeverityErrors: false,
      tokenUsage: emptyTokenUsage(),
    };
  }

  // Route the ReviewResult's verified findings through the existing sinks.
  for (const finding of result.findings) {
    reportIssue({
      file: relFile,
      line: finding.line,
      column: finding.column,
      severity: toSeverity(finding.severity),
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

  for (const score of result.scores) {
    allScores.set(score.ruleId, [
      { id: score.ruleId, scoreText: score.scoreText, score: score.score },
    ]);
  }

  if (verbose) {
    for (const diagnostic of result.diagnostics) {
      console.warn(`[vectorlint] ${diagnostic.message}`);
    }
  }

  const totalErrors = result.findings.filter((f) => f.severity === 'error').length;
  const totalWarnings = result.findings.filter((f) => f.severity === 'warning').length;

  const tokenUsage: TokenUsageStats = {
    totalInputTokens: result.usage?.inputTokens ?? 0,
    totalOutputTokens: result.usage?.outputTokens ?? 0,
  };

  if (debugJson) {
    writeReviewDebugArtifact(relFile, result);
  }

  if (outputFormat === OutputFormat.Line) {
    printEvaluationSummaries(allScores);
    console.log("");
  }

  return {
    errors: totalErrors,
    warnings: totalWarnings,
    requestFailures: 0,
    hadOperationalErrors: result.hadOperationalErrors ?? false,
    hadSeverityErrors: totalErrors > 0,
    tokenUsage,
  };
}

/*
 * Runs reviews across all target files, dispatching each through the executor
 * selected by the model-call strategy, and aggregates the results.
 */
export async function evaluateFiles(
  targets: string[],
  options: EvaluationOptions
): Promise<EvaluationResult> {
  const { outputFormat = OutputFormat.Line } = options;

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

  for (const file of targets) {
    try {
      totalFiles += 1;
      const fileResult = await evaluateFile(file, options, jsonFormatter);
      totalErrors += fileResult.errors;
      totalWarnings += fileResult.warnings;
      requestFailures += fileResult.requestFailures;
      hadOperationalErrors =
        hadOperationalErrors || fileResult.hadOperationalErrors;
      hadSeverityErrors = hadSeverityErrors || fileResult.hadSeverityErrors;

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
