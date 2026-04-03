import { calculateCost, type TokenUsageStats } from '../providers/token-usage';
import { JsonFormatter } from '../output/json-formatter';
import { RdJsonFormatter } from '../output/rdjson-formatter';
import { ValeJsonFormatter } from '../output/vale-json-formatter';
import { handleUnknownError } from '../errors/index';
import { evaluateFilesInAgentMode } from './agent-evaluation';
import { evaluateFile } from './file-evaluation';
import { AGENT_REVIEW_MODE, DEFAULT_REVIEW_MODE, OutputFormat } from './types';
import type { EvaluationOptions, EvaluationResult } from './types';

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
    return evaluateFilesInAgentMode(targets, options, outputFormat, jsonFormatter);
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
    outputTokens: totalOutputTokens,
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
