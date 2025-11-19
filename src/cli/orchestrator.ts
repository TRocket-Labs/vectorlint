import { readFileSync } from 'fs';
import * as path from 'path';
import type { PromptFile } from '../prompts/prompt-loader';
import type { LLMProvider } from '../providers/llm-provider';
import type { SearchProvider } from '../providers/search-provider';
import type { PromptMapping } from '../prompts/prompt-mapping';
import type { PromptMeta, PromptCriterionSpec } from '../schemas/prompt-schemas';
import { printFileHeader, printIssueRow, printAdvancedReport, printBasicReport } from '../output/reporter';
import { locateEvidenceWithMatch } from '../output/location';
import { JsonFormatter, type JsonIssue } from '../output/json-formatter';
import { checkTarget } from '../prompts/target';
import { resolvePromptMapping, aliasForPromptPath, isMappingConfigured } from '../prompts/prompt-mapping';
import { handleUnknownError } from '../errors/index';
import { createEvaluator } from '../evaluators/evaluator-registry';
import { isCriteriaResult } from '../prompts/schema';

export interface EvaluationOptions {
  prompts: PromptFile[];
  promptsPath: string;
  provider: LLMProvider;
  searchProvider?: SearchProvider;
  concurrency: number;
  verbose: boolean;
  mapping?: PromptMapping;
  outputFormat?: 'line' | 'JSON';
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
}

interface EvaluationContext {
  content: string;
  relFile: string;
  outputFormat: 'line' | 'JSON';
  jsonFormatter: JsonFormatter;
}

import type { EvaluationResult as PromptEvaluationResult, CriteriaResult } from '../prompts/schema';

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
  status: 'ok' | 'warning' | 'error';
  summary: string;
  ruleName: string;
  outputFormat: 'line' | 'JSON';
  jsonFormatter: JsonFormatter;
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
  status: 'ok' | 'warning' | 'error';
  ruleName: string;
  scoreText: string;
}

interface ProcessCriterionParams extends EvaluationContext {
  exp: PromptCriterionSpec;
  result: CriteriaResult;
  promptId: string;
  promptFilename: string;
  meta: PromptMeta;
}

interface ProcessCriterionResult extends ErrorTrackingResult {
  userScore: number;
  maxScore: number;
  scoreEntry: { id: string; scoreText: string };
}

interface ValidationParams {
  meta: PromptMeta;
  result: CriteriaResult;
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
  jsonFormatter: JsonFormatter;
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
  } else {
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
    jsonFormatter.addIssue(issue);
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
      scoreEntry: { id: ruleName, scoreText: 'nil' }
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
      scoreEntry: { id: ruleName, scoreText: '0/0' }
    };
  }
  
  const score = Number(got.score);
  const status: 'ok' | 'warning' | 'error' = score <= 1 ? 'error' : (score === 2 ? 'warning' : 'ok');
  
  let errors = 0;
  let warnings = 0;
  
  if (status === 'error') {
    hadSeverityErrors = true;
    errors = 1;
  } else if (status === 'warning') {
    warnings = 1;
  }
  
  const violations = got.violations;
  const rawWeighted = (score / 4) * weightNum;
  const userScore = rawWeighted;
  const rounded = Math.round(rawWeighted * 100) / 100;
  const weightedStr = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  const scoreText = `${weightedStr}/${weightNum}`;
  
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
    scoreEntry: { id: ruleName, scoreText }
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
  
  // Handle Basic Result
  if (!isCriteriaResult(result)) {
    const status = result.status;
    if (status === 'error') {
      hadSeverityErrors = true;
      promptErrors = 1;
    } else if (status === 'warning') {
      promptWarnings = 1;
    }

    // Use prompt name or filename as rule name
    const ruleName = promptId || promptFile.filename.replace(/\.md$/, '');
    
    if (outputFormat === 'line') {
      printBasicReport(result, ruleName);
    } else {
      // For JSON format, report the basic result as an issue
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
      hadSeverityErrors
    };
  }
  
  // Handle Advanced Criteria Result
  // Validate criterion completeness and scores
  hadOperationalErrors = validateCriteriaCompleteness({ meta, result }) || hadOperationalErrors;
  hadOperationalErrors = validateScores({ meta, result }) || hadOperationalErrors;
  
  let promptUserScore = 0;
  let promptMaxScore = 0;
  const criterionScores: Array<{ id: string; scoreText: string }> = [];
  
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
  }
  
  // Print per-criterion scores and overall threshold check (line format only)
  if (outputFormat === 'line') {
    const thresholdOverall = meta.threshold !== undefined ? Number(meta.threshold) : undefined;
    printAdvancedReport(criterionScores, promptMaxScore, thresholdOverall, promptUserScore);
    console.log('');
  }
  
  // Check overall threshold
  const thresholdOverall = meta.threshold !== undefined ? Number(meta.threshold) : undefined;
  if (thresholdOverall !== undefined && promptUserScore < thresholdOverall) {
    const sev = meta.severity || 'error';
    if (sev === 'error') {
      hadSeverityErrors = true;
    } else {
      promptWarnings += 1;
    }
  }
  
  return {
    errors: promptErrors,
    warnings: promptWarnings,
    hadOperationalErrors,
    hadSeverityErrors
  };
}

/*
 * Runs a single prompt evaluation.
 */
async function runPromptEvaluation(params: RunPromptEvaluationParams): Promise<RunPromptEvaluationResult> {
  const { promptFile, relFile, content, provider, searchProvider } = params;
  
  try {
    const meta = promptFile.meta;
    if (!meta || !Array.isArray(meta.criteria) || meta.criteria.length === 0) {
      throw new Error(`Prompt ${promptFile.filename} has no criteria in frontmatter`);
    }
    
    const evaluatorType = meta.evaluator || 'base-llm';
    const evaluator = createEvaluator(evaluatorType, provider, promptFile, searchProvider);
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
async function evaluateFile(params: EvaluateFileParams): Promise<EvaluateFileResult> {
  const { file, options, jsonFormatter } = params;
  const { prompts, promptsPath, provider, searchProvider, concurrency, mapping, outputFormat = 'line' } = options;
  
  let hadOperationalErrors = false;
  let hadSeverityErrors = false;
  let totalErrors = 0;
  let totalWarnings = 0;
  let requestFailures = 0;
  
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
  }
  
  if (outputFormat === 'line') {
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
  
  const jsonFormatter = new JsonFormatter();

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
  if (outputFormat === 'JSON') {
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
