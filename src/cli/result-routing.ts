import type {
  ErrorTrackingResult,
  ProcessPromptResultParams,
} from './types';
import { isJudgeResult } from '../prompts/schema';
import { routeCheckResult } from './result-routing/check-routing';
import { createIssueSink } from './result-routing/issue-sink';
import { routeJudgeResult } from './result-routing/judge-routing';

/*
 * Routes evaluation results through the dedicated check or judge handlers.
 * A lightweight issue sink isolates the routing logic from formatter-specific branching.
 */
export function routePromptResult(
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
  const sink = createIssueSink(outputFormat, jsonFormatter);

  if (isJudgeResult(result)) {
    return routeJudgeResult({
      promptFile,
      result,
      content,
      relFile,
      sink,
      verbose,
      debugJson,
    });
  }

  return routeCheckResult({
    promptFile,
    result,
    content,
    relFile,
    sink,
    verbose,
    debugJson,
  });
}
