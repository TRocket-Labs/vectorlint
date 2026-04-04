import { readFileSync } from 'fs';
import * as path from 'path';
import type { PromptFile } from '../prompts/prompt-loader';
import { USER_INSTRUCTION_FILENAME } from '../config/constants';
import { handleUnknownError, MissingDependencyError, NoConfigurationFoundError } from '../errors/index';
import { createEvaluator } from '../evaluators/index';
import { Severity, Type } from '../evaluators/types';
import {
  printEvaluationSummaries,
  printFileHeader,
  type EvaluationSummary,
} from '../output/reporter';
import type {
  EvaluateFileParams,
  EvaluateFileResult,
  RunPromptEvaluationParams,
  RunPromptEvaluationResult,
  RunPromptEvaluationResultSuccess,
} from './types';
import { routePromptResult } from './result-routing';
import { OutputFormat } from './types';
import { type TokenUsageStats } from '../providers/token-usage';
import { resolveMatchedPromptsForFile } from '../rules/matched-prompts';

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
 * Runs a single prompt evaluation.
 * BaseEvaluator auto-detects mode from criteria presence:
 * - criteria defined -> scored mode
 * - no criteria -> basic mode
 */
async function runPromptEvaluation(
  params: RunPromptEvaluationParams
): Promise<RunPromptEvaluationResult> {
  const {
    promptFile,
    relFile,
    content,
    provider,
    searchProvider,
    systemDirective,
    userInstructions,
  } = params;

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
      searchProvider,
      undefined,
      {
        ...(systemDirective ? { systemDirective } : {}),
        ...(userInstructions ? { userInstructions } : {}),
      }
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
export async function evaluateFile(
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

  const content = readFileSync(file, 'utf-8');
  const relFile = path.relative(process.cwd(), file) || file;

  if (outputFormat === OutputFormat.Line) {
    printFileHeader(relFile);
  }

  // Determine applicable prompts for this file
  let toRun: PromptFile[];
  try {
    toRun = resolveMatchedPromptsForFile({
      filePath: relFile,
      prompts,
      scanPaths,
    }).prompts;
  } catch (e: unknown) {
    if (e instanceof NoConfigurationFoundError) {
      return {
        errors: 0,
        warnings: 0,
        requestFailures: 0,
        hadOperationalErrors: false,
        hadSeverityErrors: false,
        tokenUsage: { totalInputTokens: 0, totalOutputTokens: 0 },
      };
    }
    throw e;
  }

  // If VECTORLINT.md content was loaded, append a synthetic prompt so it is
  // evaluated alongside any matched rule prompts.
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
        ...(options.systemDirective ? { systemDirective: options.systemDirective } : {}),
        ...(options.userInstructionContent ? { userInstructions: options.userInstructionContent } : {}),
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
    console.log('');
  }

  return {
    errors: totalErrors,
    warnings: totalWarnings,
    requestFailures,
    hadOperationalErrors,
    hadSeverityErrors,
    tokenUsage: tokenUsageStats,
  };
}
