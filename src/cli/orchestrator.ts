import { readFileSync } from "fs";
import * as path from "path";
import type { PromptFile } from "../prompts/prompt-loader";
import { ScanPathResolver } from "../boundaries/scan-path-resolver";
import {
  ValeJsonFormatter,
  type JsonIssue,
} from "../output/vale-json-formatter";
import {
  JsonFormatter,
  type Issue,
  type ScoreComponent,
} from "../output/json-formatter";
import { RdJsonFormatter } from "../output/rdjson-formatter";
import {
  printFileHeader,
  printIssueRow,
  printEvaluationSummaries,
  type EvaluationSummary,
} from "../output/reporter";
import { locateQuotedText } from "../output/location";
import { checkTarget } from "../prompts/target";
import { isSubjectiveResult } from "../prompts/schema";
import { handleUnknownError, MissingDependencyError } from "../errors/index";
import { createEvaluator } from "../evaluators/index";
import { Type, Severity } from "../evaluators/types";
import { OutputFormat } from "./types";
import type {
  EvaluationOptions,
  EvaluationResult,
  ErrorTrackingResult,
  ReportIssueParams,
  ProcessViolationsParams,
  ProcessCriterionParams,
  ProcessCriterionResult,
  ValidationParams,
  ProcessPromptResultParams,
  RunPromptEvaluationParams,
  RunPromptEvaluationResult,
  EvaluateFileParams,
  EvaluateFileResult,
} from "./types";

/*
 * Returns the evaluator type, defaulting to 'base' if not specified.
 */
function resolveEvaluatorType(evaluator: string | undefined): string {
  return evaluator || Type.BASE;
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
    suggestion,
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
      ...(suggestion ? { suggestion } : {}),
    };
    (jsonFormatter as JsonFormatter | RdJsonFormatter).addIssue(file, issue);
  }
}

/*
 * Locates and reports each violation using pre/post evidence markers.
 * If location matching fails (missing markers, content mismatch), logs warning
 * and continues processing. Returns hadOperationalErrors=true if any violations
 * couldn't be located, signaling text matching issues vs. content quality issues.
 */
function locateAndReportViolations(params: ProcessViolationsParams): {
  hadOperationalErrors: boolean;
} {
  const {
    violations,
    content,
    relFile,
    severity,
    ruleName,
    scoreText,
    outputFormat,
    jsonFormatter,
    verbose,
  } = params;

  let hadOperationalErrors = false;

  // Locate all violations and filter out those that can't be verified
  // Then de-duplicate by (quoted_text, line)
  const seen = new Set<string>();
  const verifiedViolations: Array<{
    v: (typeof violations)[0];
    line: number;
    column: number;
    matchedText: string;
    rowSummary: string;
  }> = [];

  for (const v of violations) {
    if (!v) continue;

    const rowSummary = (v.analysis || "").trim();

    try {
      const locWithMatch = locateQuotedText(
        content,
        {
          quoted_text: v.quoted_text || "",
          context_before: v.context_before || "",
          context_after: v.context_after || "",
        },
        80,
        v.line
      );

      if (!locWithMatch) {
        // Can't verify this quote exists - skip it entirely
        if (verbose) {
          console.warn(
            `[vectorlint] Skipping unverifiable quote: "${v.quoted_text}"`
          );
        }
        hadOperationalErrors = true;
        continue;
      }

      const line = locWithMatch.line;
      const column = locWithMatch.column;
      const matchedText = locWithMatch.match || "";

      // De-duplicate by (quoted_text, line) - skip if quoted_text is empty
      const dedupeKey = v.quoted_text ? `${v.quoted_text}:${line}` : null;
      if (dedupeKey && seen.has(dedupeKey)) {
        continue; // Skip duplicate
      }
      if (dedupeKey) {
        seen.add(dedupeKey);
      }

      verifiedViolations.push({ v, line, column, matchedText, rowSummary });
    } catch (e: unknown) {
      const err = handleUnknownError(e, "Locating evidence");
      if (verbose) {
        console.warn(`[vectorlint] Error locating evidence: ${err.message}`);
      }
      hadOperationalErrors = true;
    }
  }

  // Report only verified, unique violations
  for (const {
    v,
    line,
    column,
    matchedText,
    rowSummary,
  } of verifiedViolations) {
    reportIssue({
      file: relFile,
      line,
      column,
      severity,
      summary: rowSummary,
      ruleName,
      outputFormat,
      jsonFormatter,
      ...(v.suggestion !== undefined && { suggestion: v.suggestion }),
      scoreText,
      match: matchedText,
    });
  }

  return { hadOperationalErrors };
}

/*
 * Extracts pre-calculated scores from a subjective evaluation criterion and reports violations.
 * All violations are reported regardless of score.
 * Returns error/warning counts, score entry for Quality Scores, and score components for JSON.
 */
function extractAndReportCriterion(
  params: ProcessCriterionParams
): ProcessCriterionResult {
  const {
    exp,
    result,
    content,
    relFile,
    promptId,
    promptFilename,
    meta,
    outputFormat,
    jsonFormatter,
    verbose,
  } = params;
  let hadOperationalErrors = false;
  let hadSeverityErrors = false;

  const nameKey = String(exp.name || exp.id || "");
  const criterionId = exp.id
    ? String(exp.id)
    : exp.name
    ? String(exp.name)
        .replace(/[^A-Za-z0-9]+/g, " ")
        .split(" ")
        .filter(Boolean)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join("")
    : "";
  const ruleName =
    promptId && criterionId
      ? `${promptId}.${criterionId}`
      : promptId || criterionId || promptFilename;

  const weightNum = exp.weight || 1;
  const maxScore = weightNum;

  // Target gating (deterministic precheck)
  const metaTargetSpec = meta.target;
  const expTargetSpec = exp.target;
  const targetCheck = checkTarget(content, metaTargetSpec, expTargetSpec);
  const missingTarget = targetCheck.missing;

  if (missingTarget) {
    hadSeverityErrors = true;
    const summary = "target not found";
    const suggestion =
      targetCheck.suggestion ||
      expTargetSpec?.suggestion ||
      metaTargetSpec?.suggestion ||
      "Add the required target section.";
    reportIssue({
      file: relFile,
      line: 1,
      column: 1,
      severity: Severity.ERROR,
      summary,
      ruleName,
      outputFormat,
      jsonFormatter,
      suggestion,
      scoreText: "nil",
      match: "",
    });
    return {
      errors: 1,
      warnings: 0,
      userScore: 0,
      maxScore,
      hadOperationalErrors,
      hadSeverityErrors,
      scoreEntry: { id: ruleName, scoreText: "0.0/10", score: 0.0 },
      scoreComponent: {
        criterion: nameKey,
        rawScore: 0,
        maxScore: 4,
        weightedScore: 0,
        weightedMaxScore: weightNum,
        normalizedScore: 0,
        normalizedMaxScore: 10,
      },
    };
  }

  const got = result.criteria.find(
    (c) => c.name === nameKey || c.name.toLowerCase() === nameKey.toLowerCase()
  );
  if (!got) {
    return {
      errors: 0,
      warnings: 0,
      userScore: 0,
      maxScore,
      hadOperationalErrors,
      hadSeverityErrors,
      scoreEntry: { id: ruleName, scoreText: "-", score: 0.0 },
      scoreComponent: {
        criterion: nameKey,
        rawScore: 0,
        maxScore: 4,
        weightedScore: 0,
        weightedMaxScore: weightNum,
        normalizedScore: 0,
        normalizedMaxScore: 10,
      },
    };
  }

  const score = Number(got.score);

  // Use pre-calculated values from evaluator
  const rawWeighted = got.weighted_points;
  const normalizedScore = got.normalized_score;
  const userScore = rawWeighted;
  const violations = got.violations;

  // Display normalized score (1-10) in CLI output
  const scoreText = `${normalizedScore.toFixed(1)}/10`;

  // Determine severity based on violations
  // If there are violations, use evaluator's scoring to determine severity
  // Score <= 1 = error, score = 2 = warning, score > 2 = no severity needed (but we still create scoreEntry)
  let errors = 0;
  let warnings = 0;
  let severity: Severity | undefined;

  if (violations.length > 0) {
    // Determine severity from score for violations
    if (score <= 1) {
      severity = Severity.ERROR;
      hadSeverityErrors = true;
      errors = violations.length;
    } else if (score === 2) {
      severity = Severity.WARNING;
      warnings = violations.length;
    } else {
      // Score > 2 but has violations - this is informational
      // Use WARNING as default for informational violations
      severity = Severity.WARNING;
      warnings = violations.length;
    }

    // Report all violations
    const violationResult = locateAndReportViolations({
      violations: violations as Array<{
        line?: number;
        quoted_text?: string;
        context_before?: string;
        context_after?: string;
        analysis?: string;
        suggestion?: string;
      }>,
      content,
      relFile,
      severity,
      ruleName,
      scoreText,
      outputFormat,
      jsonFormatter,
      verbose: !!verbose,
    });
    hadOperationalErrors =
      hadOperationalErrors || violationResult.hadOperationalErrors;
  } else if (score <= 2) {
    // No violations but low score - report with summary
    severity = score <= 1 ? Severity.ERROR : Severity.WARNING;
    if (severity === Severity.ERROR) {
      hadSeverityErrors = true;
      errors = 1;
    } else {
      warnings = 1;
    }

    const sum = got.summary.trim();
    const words = sum.split(/\s+/).filter(Boolean);
    const limited = words.slice(0, 15).join(" ");
    const summaryText = limited || "No findings";
    reportIssue({
      file: relFile,
      line: 1,
      column: 1,
      severity,
      summary: summaryText,
      ruleName,
      outputFormat,
      jsonFormatter,
      scoreText,
      match: "",
    });
  }

  return {
    errors,
    warnings,
    userScore,
    maxScore,
    hadOperationalErrors,
    hadSeverityErrors,
    scoreEntry: { id: ruleName, scoreText, score: normalizedScore },
    scoreComponent: {
      criterion: nameKey,
      rawScore: score,
      maxScore: 4,
      weightedScore: rawWeighted,
      weightedMaxScore: weightNum,
      normalizedScore: normalizedScore,
      normalizedMaxScore: 10,
    },
  };
}

/*
 * Validates that all expected criteria are present in the result.
 */
function validateCriteriaCompleteness(params: ValidationParams): boolean {
  const { meta, result } = params;
  let hadErrors = false;

  const expectedNames = new Set<string>(
    (meta.criteria || []).map((c) => String(c.name || c.id || ""))
  );
  const returnedNames = new Set(
    result.criteria.map((c: { name: string }) => c.name)
  );

  // Create normalized maps for case-insensitive lookup
  const expectedNormalized = new Set<string>();
  const expectedOriginalMap = new Map<string, string>();
  for (const name of expectedNames) {
    const norm = name.toLowerCase();
    expectedNormalized.add(norm);
    expectedOriginalMap.set(norm, name);
  }

  const returnedNormalized = new Set<string>();
  for (const name of returnedNames) {
    returnedNormalized.add(name.toLowerCase());
  }

  for (const norm of expectedNormalized) {
    if (!returnedNormalized.has(norm)) {
      console.error(
        `Missing criterion in model output: ${expectedOriginalMap.get(norm)}`
      );
      hadErrors = true;
    }
  }

  for (const name of returnedNames) {
    if (!expectedNormalized.has(name.toLowerCase())) {
      console.warn(
        `[vectorlint] Extra criterion returned by model (ignored): ${name}`
      );
    }
  }

  return hadErrors;
}

/*
 * Validates that all criterion scores are within valid range.
 */
function validateScores(params: ValidationParams): boolean {
  const { meta, result } = params;
  let hadErrors = false;

  for (const exp of meta.criteria || []) {
    const nameKey = String(exp.name || exp.id || "");
    const got = result.criteria.find(
      (c) =>
        c.name === nameKey || c.name.toLowerCase() === nameKey.toLowerCase()
    );
    if (!got) continue;

    const score = Number(got.score);
    if (!Number.isFinite(score) || score < 0 || score > 4) {
      console.error(`Invalid score for ${nameKey}: ${score}`);
      hadErrors = true;
    }
  }

  return hadErrors;
}

/*
 * Routes evaluation results through semi-objective or subjective processing paths.
 * Semi-objective: Reports violations, creates scoreEntry using final_score.
 * Subjective: Iterates through criteria, validates scores, creates scoreEntry per criterion.
 * Both paths generate scoreEntries for Quality Scores display.
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
  } = params;
  const meta = promptFile.meta;
  const promptId = (meta.id || "").toString();

  let hadOperationalErrors = false;
  let hadSeverityErrors = false;
  let promptErrors = 0;
  let promptWarnings = 0;

  // Handle Semi-Objective Result
  if (!isSubjectiveResult(result)) {
    const severity = result.severity;
    const ruleName = promptId || promptFile.filename.replace(/\.md$/, "");
    const violationCount = result.violations.length;

    if (violationCount > 0) {
      const violationResult = locateAndReportViolations({
        violations: result.violations,
        content,
        relFile,
        severity,
        ruleName,
        scoreText: "",
        outputFormat,
        jsonFormatter,
        verbose: !!verbose,
      });
      hadOperationalErrors =
        hadOperationalErrors || violationResult.hadOperationalErrors;
    } else if (
      (outputFormat === OutputFormat.Json ||
        outputFormat === OutputFormat.ValeJson) &&
      result.message
    ) {
      // For JSON, if there's a message but no violations, report it as a general issue
      reportIssue({
        file: relFile,
        line: 1,
        column: 1,
        severity,
        summary: result.message,
        ruleName,
        outputFormat,
        jsonFormatter,
        match: "",
      });
    }

    // Create scoreEntry for Quality Scores display
    const scoreEntry: EvaluationSummary = {
      id: ruleName,
      scoreText: `${result.final_score.toFixed(1)}/10`,
      score: result.final_score,
    };

    return {
      errors: severity === Severity.ERROR ? violationCount : 0,
      warnings: severity === Severity.WARNING ? violationCount : 0,
      hadOperationalErrors,
      hadSeverityErrors: severity === Severity.ERROR,
      scoreEntries: [scoreEntry],
    };
  }

  // Handle Subjective Result
  // Validate criterion completeness and scores
  hadOperationalErrors =
    validateCriteriaCompleteness({ meta, result }) || hadOperationalErrors;
  hadOperationalErrors =
    validateScores({ meta, result }) || hadOperationalErrors;

  // Reset promptErrors and promptWarnings for subjective results
  promptErrors = 0;
  promptWarnings = 0;
  const criterionScores: EvaluationSummary[] = [];
  const scoreComponents: ScoreComponent[] = [];

  // Iterate through each criterion
  for (const exp of meta.criteria || []) {
    const criterionResult = extractAndReportCriterion({
      exp,
      result,
      content,
      relFile,
      promptId,
      promptFilename: promptFile.filename,
      meta,
      outputFormat,
      jsonFormatter,
      verbose: !!verbose,
    });

    promptErrors += criterionResult.errors;
    promptWarnings += criterionResult.warnings;
    hadOperationalErrors =
      hadOperationalErrors || criterionResult.hadOperationalErrors;
    hadSeverityErrors = hadSeverityErrors || criterionResult.hadSeverityErrors;
    criterionScores.push(criterionResult.scoreEntry);

    if (criterionResult.scoreComponent) {
      scoreComponents.push(criterionResult.scoreComponent);
    }
  }

  if (outputFormat === OutputFormat.Json && scoreComponents.length > 0) {
    (jsonFormatter as JsonFormatter | RdJsonFormatter).addEvaluationScore(
      relFile,
      {
        id: promptId || promptFile.filename.replace(/\.md$/, ""),
        scores: scoreComponents,
      }
    );
  }

  return {
    errors: promptErrors,
    warnings: promptWarnings,
    hadOperationalErrors,
    hadSeverityErrors,
    scoreEntries: criterionScores,
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

    const evaluatorType = resolveEvaluatorType(meta.evaluator);

    // Specialized evaluators (e.g., technical-accuracy) require criteria
    // BaseEvaluator handles both modes: scored (with criteria) and basic (without)
    if (evaluatorType !== (Type.BASE as string)) {
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

    return { ok: true, result };
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
  } = options;

  let hadOperationalErrors = false;
  let hadSeverityErrors = false;
  let totalErrors = 0;
  let totalWarnings = 0;
  let requestFailures = 0;
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

    // Filter prompts by active packs and check if disabled
    const activePrompts = prompts.filter((p) => {
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
    // This maintains backward compatibility for unconfigured setups.
    toRun.push(...prompts);
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

    const promptResult = routePromptResult({
      promptFile: p,
      result: r.result,
      content,
      relFile,
      outputFormat,
      jsonFormatter,
      verbose,
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
  };
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
  const { outputFormat = OutputFormat.Line } = options;

  let hadOperationalErrors = false;
  let hadSeverityErrors = false;
  let totalFiles = 0;
  let totalErrors = 0;
  let totalWarnings = 0;
  let requestFailures = 0;

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
      const fileResult = await evaluateFile({ file, options, jsonFormatter });
      totalErrors += fileResult.errors;
      totalWarnings += fileResult.warnings;
      requestFailures += fileResult.requestFailures;
      hadOperationalErrors =
        hadOperationalErrors || fileResult.hadOperationalErrors;
      hadSeverityErrors = hadSeverityErrors || fileResult.hadSeverityErrors;
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

  return {
    totalFiles,
    totalErrors,
    totalWarnings,
    requestFailures,
    hadOperationalErrors,
    hadSeverityErrors,
  };
}
