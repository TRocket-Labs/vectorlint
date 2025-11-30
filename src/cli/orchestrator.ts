import { readFileSync } from 'fs';
import * as path from 'path';
import type { PromptFile } from '../prompts/prompt-loader';
import type { LLMProvider } from '../providers/llm-provider';
import type { SearchProvider } from '../providers/search-provider';
import type { PromptMapping } from '../prompts/prompt-mapping';
import type { PromptMeta, PromptCriterionSpec } from '../schemas/prompt-schemas';
import { printFileHeader, printIssueRow, printEvaluationSummaries, type EvaluationSummary } from '../output/reporter';
import { locateEvidenceWithMatch } from '../output/location';
import { ValeJsonFormatter, type JsonIssue } from '../output/vale-json-formatter';
import { JsonFormatter, type Issue, type EvaluationScore, type ScoreComponent } from '../output/json-formatter';
import { checkTarget } from '../prompts/target';
import { resolvePromptMapping, aliasForPromptPath, isMappingConfigured } from '../prompts/prompt-mapping';
import { handleUnknownError } from '../errors/index';
import { createEvaluator } from '../evaluators/index';
import { isSubjectiveResult } from '../prompts/schema';
import { Type, EvaluationType } from '../evaluators/types';
export interface EvaluationOptions {
  prompts: PromptFile[];
  promptsPath: string;
  provider: LLMProvider;
  searchProvider?: SearchProvider;
  concurrency: number;
  verbose: boolean;
  mapping?: PromptMapping;
  outputFormat?: 'line' | 'json' | 'vale-json';
}

export interface EvaluationResult {
  totalFiles: number;
  totalErrors: number;
  totalWarnings: number;
  requestFailures: number;
  hadOperationalErrors: boolean;
  hadSeverityErrors: boolean;
}

interface ErrorTrackingResult {
  errors: number;
  warnings: number;
  hadOperationalErrors: boolean;
  hadSeverityErrors: boolean;
  scoreEntries?: EvaluationSummary[];
}

interface EvaluationContext {
  content: string;
  relFile: string;
  outputFormat: 'line' | 'json' | 'vale-json';
  jsonFormatter: ValeJsonFormatter | JsonFormatter;
}

import type { EvaluationResult as PromptEvaluationResult, SubjectiveResult } from '../prompts/schema';

/*
 * Returns the evaluator type, defaulting to 'base' if not specified.
 */
function resolveEvaluatorType(evaluator: string | undefined): string {
  return evaluator || Type.BASE;
}

interface GetApplicablePromptsParams {
  file: string;
  prompts: PromptFile[];
  promptsPath: string;
  mapping?: PromptMapping;
}

interface ReportIssueParams {
  file: string;
  line: number;
  column: number;
  status: 'warning' | 'error' | undefined;
  summary: string;
  ruleName: string;
  outputFormat: 'line' | 'json' | 'vale-json';
  jsonFormatter: ValeJsonFormatter | JsonFormatter;
  suggestion?: string;
  scoreText?: string;
  match?: string;
}

interface ExtractMatchTextParams {
  content: string;
  line: number;
  matchedText: string;
  rowSummary: string;
}

interface LocationMatch {
  line: number;
  column: number;
  match: string;
}

interface ProcessViolationsParams extends EvaluationContext {
  violations: Array<{
    pre?: string;
    post?: string;
    analysis?:
    string;
    suggestion?: string
  }>;
  status: 'warning' | 'error' | undefined;
  ruleName: string;
  scoreText: string;
}

interface ProcessCriterionParams extends EvaluationContext {
  exp: PromptCriterionSpec;
  result: SubjectiveResult;
  promptId: string;
  promptFilename: string;
  meta: PromptMeta;
}

interface ProcessCriterionResult extends ErrorTrackingResult {
  userScore: number;
  maxScore: number;
  scoreEntry: { id: string; scoreText: string };
  scoreComponent?: ScoreComponent;
}

interface ValidationParams {
  meta: PromptMeta;
  result: SubjectiveResult;
}

interface ProcessPromptResultParams extends EvaluationContext {
  promptFile: PromptFile;
  result: PromptEvaluationResult;
}

interface RunPromptEvaluationParams {
  promptFile: PromptFile;
  relFile: string;
  content: string;
  provider: LLMProvider;
  searchProvider?: SearchProvider;
}

type RunPromptEvaluationResult =
  | { ok: true; result: PromptEvaluationResult }
  | { ok: false; error: Error };

interface EvaluateFileParams {
  file: string;
  options: EvaluationOptions;
  jsonFormatter: ValeJsonFormatter | JsonFormatter;
}

interface EvaluateFileResult extends ErrorTrackingResult {
  requestFailures: number;
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
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
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
  const { file, line, column, status, summary, ruleName, outputFormat, jsonFormatter, suggestion, scoreText, match } = params;

  if (outputFormat === 'line') {
    const locStr = `${line}:${column}`;
    printIssueRow(locStr, status, summary, ruleName, suggestion ? { suggestion } : {});
  } else if (outputFormat === 'vale-json') {
    const severity = status === 'error' ? 'error' : status === 'warning' ? 'warning' : 'info';
    const issue: JsonIssue = {
      file,
      line,
      column,
      severity,
      message: summary,
      rule: ruleName,
      match: match || '',
      matchLength: match ? match.length : 0,
      ...(suggestion !== undefined ? { suggestion } : {}),
      ...(scoreText !== undefined ? { score: scoreText } : {}),
    };
    (jsonFormatter as ValeJsonFormatter).addIssue(issue);
  } else if (outputFormat === 'json') {
    const severity = status === 'error' ? 'error' : status === 'warning' ? 'warning' : 'info';
    const matchLen = match ? match.length : 0;
    const endColumn = column + matchLen;
    const issue: Issue = {
      line,
      column,
      span: [column, endColumn],
      severity,
      message: summary,
      eval: ruleName,
      match: match || '',
      ...(suggestion ? { suggestion } : {})
    };
    (jsonFormatter as JsonFormatter).addIssue(file, issue);
  }
}


/*
 * Determines which prompts should run for a given file based on mapping configuration.
 */
function getApplicablePrompts(params: GetApplicablePromptsParams): PromptFile[] {
  const { file, prompts, promptsPath, mapping } = params;

  if (!mapping || !isMappingConfigured(mapping)) {
    return prompts;
  }

  return prompts.filter((p) => {
    const promptId = String(p.meta.id || p.id);
    const full = p.fullPath || path.resolve(promptsPath, p.filename);
    const alias = aliasForPromptPath(full, mapping, process.cwd());
    return resolvePromptMapping(file, promptId, mapping, alias);
  });
}

/*
 * Extracts the best match text from evidence markers and analysis message.
 */
function extractMatchText(params: ExtractMatchTextParams): LocationMatch {
  const { content, line, matchedText, rowSummary } = params;

  const finalLine = line;
  let finalColumn = 1;
  let finalMatch = matchedText;

  // Extract quoted text from the analysis message
  const quotedMatch = rowSummary.match(/'([^']+)'|"([^"]+)"|`([^`]+)`/);
  const quotedText = quotedMatch ? (quotedMatch[1] || quotedMatch[2] || quotedMatch[3]) : '';

  if (quotedText) {
    // Check if the quoted text is in the matched text from pre/post
    if (matchedText && matchedText.includes(quotedText)) {
      finalMatch = quotedText;
      const lines = content.split('\n');
      if (line >= 1 && line <= lines.length) {
        const lineContent = lines[line - 1] || '';
        const quotedIndex = lineContent.indexOf(quotedText);
        if (quotedIndex !== -1) {
          finalColumn = quotedIndex + 1;
        }
      }
    } else if (!matchedText || !matchedText.includes(quotedText)) {
      // Search for quoted text on the same line
      const lines = content.split('\n');
      if (line >= 1 && line <= lines.length) {
        const lineContent = lines[line - 1] || '';
        const quotedIndex = lineContent.indexOf(quotedText);
        if (quotedIndex !== -1) {
          finalColumn = quotedIndex + 1;
          finalMatch = quotedText;
        }
      }
    }
  }

  // If still no match, extract a meaningful snippet from the line
  if (!finalMatch && !quotedText) {
    const lines = content.split('\n');
    if (line >= 1 && line <= lines.length) {
      const lineContent = lines[line - 1] || '';
      const words = lineContent.trim().split(/\s+/).slice(0, 5).join(' ');
      finalMatch = words.length > 50 ? words.substring(0, 50) : words;
    }
  }

  return { line: finalLine, column: finalColumn, match: finalMatch };
}

/*
 * Processes violations for a criterion and reports each one.
 */
function processViolations(params: ProcessViolationsParams): { hadOperationalErrors: boolean } {
  const { violations, content, relFile, status, ruleName, scoreText, outputFormat, jsonFormatter } = params;

  let hadOperationalErrors = false;

  for (const v of violations) {
    if (!v) continue;

    let line = 1;
    let column = 1;
    let matchedText = '';
    const rowSummary = (v.analysis || '').trim();

    try {
      const locWithMatch = locateEvidenceWithMatch(content, { pre: v.pre || '', post: v.post || '' });
      if (locWithMatch) {
        line = locWithMatch.line;
        column = locWithMatch.column;
        matchedText = locWithMatch.match || '';

        const extracted = extractMatchText({ content, line, matchedText, rowSummary });
        line = extracted.line;
        column = extracted.column;
        matchedText = extracted.match;
      } else {
        hadOperationalErrors = true;
      }
    } catch (e: unknown) {
      const err = handleUnknownError(e, 'Locating evidence');
      console.warn(`[vectorlint] Warning: ${err.message}`);
      hadOperationalErrors = true;
    }

    reportIssue({
      file: relFile,
      line,
      column,
      status,
      summary: rowSummary,
      ruleName,
      outputFormat,
      jsonFormatter,
      ...(v.suggestion !== undefined && { suggestion: v.suggestion }),
      scoreText,
      match: matchedText
    });
  }

  return { hadOperationalErrors };
}

/*
 * Processes a single criterion and reports its results.
 */
function processCriterion(params: ProcessCriterionParams): ProcessCriterionResult {
  const { exp, result, content, relFile, promptId, promptFilename, meta, outputFormat, jsonFormatter } = params;
  let hadOperationalErrors = false;
  let hadSeverityErrors = false;

  const nameKey = String(exp.name || exp.id || '');
  const criterionId = (exp.id ? String(exp.id) : (exp.name ? String(exp.name).replace(/[^A-Za-z0-9]+/g, ' ').split(' ').filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('') : ''));
  const ruleName = promptId && criterionId ? `${promptId}.${criterionId}` : (promptId || criterionId || promptFilename);

  const weightNum = exp.weight || 1;
  const maxScore = weightNum;

  // Target gating (deterministic precheck)
  const metaTargetSpec = meta.target;
  const expTargetSpec = exp.target;
  const targetCheck = checkTarget(content, metaTargetSpec, expTargetSpec);
  const missingTarget = targetCheck.missing;

  if (missingTarget) {
    hadSeverityErrors = true;
    const summary = 'target not found';
    const suggestion = (targetCheck.suggestion || expTargetSpec?.suggestion || metaTargetSpec?.suggestion || 'Add the required target section.');
    reportIssue({
      file: relFile,
      line: 1,
      column: 1,
      status: 'error',
      summary,
      ruleName,
      outputFormat,
      jsonFormatter,
      suggestion,
      scoreText: 'nil',
      match: ''
    });
    return {
      errors: 1,
      warnings: 0,
      userScore: 0,
      maxScore,
      hadOperationalErrors,
      hadSeverityErrors,
      scoreEntry: { id: ruleName, scoreText: '0.0/10' },
      scoreComponent: {
        criterion: nameKey,
        rawScore: 0,
        maxScore: 4,
        weightedScore: 0,
        weightedMaxScore: weightNum,
        normalizedScore: 0,
        normalizedMaxScore: 10
      }
    };
  }

  const got = result.criteria.find(c => c.name === nameKey);
  if (!got) {
    return {
      errors: 0,
      warnings: 0,
      userScore: 0,
      maxScore,
      hadOperationalErrors,
      hadSeverityErrors,
      scoreEntry: { id: ruleName, scoreText: '-' },
      scoreComponent: {
        criterion: nameKey,
        rawScore: 0,
        maxScore: 4,
        weightedScore: 0,
        weightedMaxScore: weightNum,
        normalizedScore: 0,
        normalizedMaxScore: 10
      }
    };
  }

  const score = Number(got.score);
  const status: 'warning' | 'error' | undefined = score <= 1 ? 'error' : (score === 2 ? 'warning' : undefined);

  let errors = 0;
  let warnings = 0;

  if (status === 'error') {
    hadSeverityErrors = true;
    errors = 1;
  } else if (status === 'warning') {
    warnings = 1;
  }

  const violations = got.violations;
  // Use pre-calculated values from evaluator
  const rawWeighted = got.weighted_points;
  const normalizedScore = got.normalized_score;
  const userScore = rawWeighted;

  // Display normalized score (1-10) in CLI output
  const scoreText = `${normalizedScore.toFixed(1)}/10`;

  // Skip reporting entirely if status is undefined (clean result)
  if (status === undefined) {
    return {
      errors: 0,
      warnings: 0,
      userScore,
      maxScore,
      hadOperationalErrors,
      hadSeverityErrors,
      scoreEntry: { id: ruleName, scoreText }
    };
  }

  if (violations.length === 0) {
    const sum = got.summary.trim();
    const words = sum.split(/\s+/).filter(Boolean);
    const limited = words.slice(0, 15).join(' ');
    const summaryText = limited || 'No findings';
    reportIssue({
      file: relFile,
      line: 1,
      column: 1,
      status,
      summary: summaryText,
      ruleName,
      outputFormat,
      jsonFormatter,
      scoreText,
      match: ''
    });
  } else {
    const violationResult = processViolations({
      violations: violations as Array<{ pre?: string; post?: string; analysis?: string; suggestion?: string }>,
      content,
      relFile,
      status,
      ruleName,
      scoreText,
      outputFormat,
      jsonFormatter
    });
    hadOperationalErrors = hadOperationalErrors || violationResult.hadOperationalErrors;
  }

  return {
    errors,
    warnings,
    userScore,
    maxScore,
    hadOperationalErrors,
    hadSeverityErrors,
    scoreEntry: { id: ruleName, scoreText },
    scoreComponent: {
      criterion: nameKey,
      rawScore: score,
      maxScore: 4,
      weightedScore: rawWeighted,
      weightedMaxScore: weightNum,
      normalizedScore: normalizedScore,
      normalizedMaxScore: 10
    }
  };
}

/*
 * Validates that all expected criteria are present in the result.
 */
function validateCriteriaCompleteness(params: ValidationParams): boolean {
  const { meta, result } = params;
  let hadErrors = false;

  const expectedNames = new Set<string>((meta.criteria || []).map((c) => String(c.name || c.id || '')));
  const returnedNames = new Set(result.criteria.map((c: { name: string }) => c.name));

  for (const name of expectedNames) {
    if (!returnedNames.has(name)) {
      console.error(`Missing criterion in model output: ${name}`);
      hadErrors = true;
    }
  }

  for (const name of returnedNames) {
    if (!expectedNames.has(name)) {
      console.warn(`[vectorlint] Extra criterion returned by model (ignored): ${name}`);
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
    const nameKey = String(exp.name || exp.id || '');
    const got = result.criteria.find(c => c.name === nameKey);
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
 * Processes results from a single prompt evaluation.
 */
function processPromptResult(params: ProcessPromptResultParams): ErrorTrackingResult {
  const { promptFile, result, content, relFile, outputFormat, jsonFormatter } = params;
  const meta = promptFile.meta;
  const promptId = (meta.id || '').toString();

  let hadOperationalErrors = false;
  let hadSeverityErrors = false;
  let promptErrors = 0;
  let promptWarnings = 0;

  // Handle Semi-Objective Result
  if (!isSubjectiveResult(result)) {
    const status = result.status;
    if (status === 'error') {
      hadSeverityErrors = true;
      promptErrors = 1;
    } else if (status === 'warning') {
      promptWarnings = 1;
    }

    // Use prompt name or filename as rule name
    const ruleName = promptId || promptFile.filename.replace(/\.md$/, '');

    if (result.violations.length > 0) {
      const violationResult = processViolations({
        violations: result.violations,
        content,
        relFile,
        status,
        ruleName,
        scoreText: '',
        outputFormat,
        jsonFormatter
      });
      hadOperationalErrors = hadOperationalErrors || violationResult.hadOperationalErrors;
    } else if ((outputFormat === 'json' || outputFormat === 'vale-json') && result.message) {
      // For JSON, if there's a message but no violations, report it as a general issue
      reportIssue({
        file: relFile,
        line: 1,
        column: 1,
        status,
        summary: result.message,
        ruleName,
        outputFormat,
        jsonFormatter,
        match: ''
      });
    }

    return {
      errors: promptErrors,
      warnings: promptWarnings,
      hadOperationalErrors,
      hadSeverityErrors,
      scoreEntries: []
    };
  }

  // Handle Subjective Result
  // Validate criterion completeness and scores
  hadOperationalErrors = validateCriteriaCompleteness({ meta, result }) || hadOperationalErrors;
  hadOperationalErrors = validateScores({ meta, result }) || hadOperationalErrors;

  let promptUserScore = 0;
  let promptMaxScore = 0;
  const criterionScores: EvaluationSummary[] = [];
  const scoreComponents: ScoreComponent[] = [];

  // Process each criterion
  for (const exp of meta.criteria || []) {
    const criterionResult = processCriterion({
      exp,
      result,
      content,
      relFile,
      promptId,
      promptFilename: promptFile.filename,
      meta,
      outputFormat,
      jsonFormatter
    });

    promptErrors += criterionResult.errors;
    promptWarnings += criterionResult.warnings;
    promptUserScore += criterionResult.userScore;
    promptMaxScore += criterionResult.maxScore;
    hadOperationalErrors = hadOperationalErrors || criterionResult.hadOperationalErrors;
    hadSeverityErrors = hadSeverityErrors || criterionResult.hadSeverityErrors;
    criterionScores.push(criterionResult.scoreEntry);
    if (criterionResult.scoreComponent) {
      scoreComponents.push(criterionResult.scoreComponent);
    }
  }

  if (outputFormat === 'json' && scoreComponents.length > 0) {
    (jsonFormatter as JsonFormatter).addEvaluationScore(relFile, {
      id: promptId || promptFile.filename.replace(/\.md$/, ''),
      scores: scoreComponents
    });
  }

  return {
    errors: promptErrors,
    warnings: promptWarnings,
    hadOperationalErrors,
    hadSeverityErrors,
    scoreEntries: criterionScores
  };
}

/*
 * Runs a single prompt evaluation.
 * BaseEvaluator auto-detects mode from criteria presence:
 * - criteria defined → scored mode
 * - no criteria → basic mode
 */
async function runPromptEvaluation(params: RunPromptEvaluationParams): Promise<RunPromptEvaluationResult> {
  const { promptFile, relFile, content, provider, searchProvider } = params;

  try {
    const meta = promptFile.meta;
    const evaluatorType = resolveEvaluatorType(meta.evaluator);

    // Specialized evaluators (e.g., technical-accuracy) require criteria
    // BaseEvaluator handles both modes: scored (with criteria) and basic (without)
    if (evaluatorType !== Type.BASE) {
      if (!meta || !Array.isArray(meta.criteria) || meta.criteria.length === 0) {
        throw new Error(`Prompt ${promptFile.filename} has no criteria in frontmatter`);
      }
    }
    const evaluator = createEvaluator(evaluatorType, provider, promptFile, searchProvider);
    const result = await evaluator.evaluate(relFile, content);

    return { ok: true, result };
  } catch (e: unknown) {
    const err = handleUnknownError(e, `Running prompt ${promptFile.filename}`);

    // Gracefully skip evaluators with missing dependencies (e.g., search provider not configured)
    if (err.message.includes('requires a search provider')) {
      console.warn(`[vectorlint] Skipping ${promptFile.filename}: ${err.message}`);
      console.warn(`[vectorlint] Hint: Configure TAVILY_API_KEY or PERPLEXITY_API_KEY in .env, or remove this eval.`);
      // Return success with perfect score to indicate "skipped, not failed"
      return {
        ok: true,
        result: {
          type: EvaluationType.SEMI_OBJECTIVE,
          final_score: 10,
          percentage: 100,
          passed_count: 0,
          total_count: 0,
          items: [],
          message: 'Skipped - missing dependencies',
          violations: []
        }
      };
    }

    return { ok: false, error: err };
  }
}

/*
 * Evaluates a single file with all applicable prompts.
 */
async function evaluateFile(params: EvaluateFileParams): Promise<EvaluateFileResult> {
  const { file, options, jsonFormatter } = params;
  const { prompts, promptsPath, provider, searchProvider, concurrency, mapping, outputFormat = 'line' } = options;

  let hadOperationalErrors = false;
  let hadSeverityErrors = false;
  let totalErrors = 0;
  let totalWarnings = 0;
  let requestFailures = 0;
  const allScores = new Map<string, EvaluationSummary[]>();

  const content = readFileSync(file, 'utf-8');
  const relFile = path.relative(process.cwd(), file) || file;

  if (outputFormat === 'line') {
    printFileHeader(relFile);
  }

  // Determine applicable prompts for this file
  const toRun = getApplicablePrompts({
    file: relFile,
    prompts,
    promptsPath,
    ...(mapping !== undefined && { mapping })
  });

  const results = await runWithConcurrency(toRun, concurrency, async (p) => {
    return runPromptEvaluation({
      promptFile: p,
      relFile,
      content,
      provider,
      ...(searchProvider !== undefined && { searchProvider })
    });
  });

  // Process results for each prompt
  for (let idx = 0; idx < toRun.length; idx++) {
    const p = toRun[idx];
    const r = results[idx];
    if (!p || !r) continue;

    if (r.ok !== true) {
      console.error(`  Prompt failed: ${p.filename}`);
      console.error(r.error);
      hadOperationalErrors = true;
      requestFailures += 1;
      continue;
    }

    const promptResult = processPromptResult({
      promptFile: p,
      result: r.result,
      content,
      relFile,
      outputFormat,
      jsonFormatter
    });
    totalErrors += promptResult.errors;
    totalWarnings += promptResult.warnings;
    hadOperationalErrors = hadOperationalErrors || promptResult.hadOperationalErrors;
    hadSeverityErrors = hadSeverityErrors || promptResult.hadSeverityErrors;

    if (promptResult.scoreEntries && promptResult.scoreEntries.length > 0) {
      const ruleName = (p.meta.id || p.filename).toString();
      allScores.set(ruleName, promptResult.scoreEntries);
    }
  }

  if (outputFormat === 'line') {

    printEvaluationSummaries(allScores);
    console.log('');
  }

  return {
    errors: totalErrors,
    warnings: totalWarnings,
    requestFailures,
    hadOperationalErrors,
    hadSeverityErrors
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
  const { outputFormat = 'line' } = options;

  let hadOperationalErrors = false;
  let hadSeverityErrors = false;
  let totalFiles = 0;
  let totalErrors = 0;
  let totalWarnings = 0;
  let requestFailures = 0;

  let jsonFormatter: ValeJsonFormatter | JsonFormatter;
  if (outputFormat === 'json') {
    jsonFormatter = new JsonFormatter();
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
      hadOperationalErrors = hadOperationalErrors || fileResult.hadOperationalErrors;
      hadSeverityErrors = hadSeverityErrors || fileResult.hadSeverityErrors;
    } catch (e: unknown) {
      const err = handleUnknownError(e, `Processing file ${file}`);
      console.error(`Error processing file ${file}: ${err.message}`);
      hadOperationalErrors = true;
    }
  }

  // Output results based on format
  if (outputFormat === 'json' || outputFormat === 'vale-json') {
    console.log(jsonFormatter.toJson());
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
