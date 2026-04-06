import type { RuleFile } from '../../rules/rule-loader';
import type { RawCheckResult } from '../../prompts/schema';
import { Severity } from '../../evaluators/types';
import { calculateCheckScore } from '../../scoring';
import {
  buildRuleName,
  getViolationFilterResults,
  locateAndReportViolations,
} from '../issue-output';
import type { ErrorTrackingResult } from '../types';
import { writeCheckRoutingDebugArtifact } from './debug-artifact';
import type { IssueSink } from './issue-sink';

export interface RouteCheckResultParams {
  promptFile: RuleFile;
  result: RawCheckResult;
  content: string;
  relFile: string;
  sink: IssueSink;
  verbose?: boolean;
  debugJson?: boolean;
}

export function routeCheckResult(
  params: RouteCheckResultParams
): ErrorTrackingResult {
  const { promptFile, result, content, relFile, sink, verbose, debugJson } = params;
  const meta = promptFile.meta;
  const promptId = (meta.id || '').toString();

  let hadOperationalErrors = false;
  const { decisions, surfacedViolations } = getViolationFilterResults(
    result.violations
  );

  const scored = calculateCheckScore(
    surfacedViolations,
    result.word_count,
    {
      strictness: promptFile.meta.strictness,
      promptSeverity: promptFile.meta.severity,
    }
  );
  const severity = scored.severity;
  const violationsByCriterion = new Map<
    string | undefined,
    typeof surfacedViolations
  >();

  for (const violation of surfacedViolations) {
    const criterionName = violation.criterionName;
    if (!violationsByCriterion.has(criterionName)) {
      violationsByCriterion.set(criterionName, []);
    }
    violationsByCriterion.get(criterionName)!.push(violation);
  }

  let totalErrors = 0;
  let totalWarnings = 0;

  for (const [criterionName, violations] of violationsByCriterion) {
    let criterionId: string | undefined;
    if (criterionName && meta.criteria) {
      const criterion = meta.criteria.find(
        (entry) => entry.name.toLowerCase() === criterionName.toLowerCase()
      );
      criterionId = criterion?.id;
    }

    const ruleName = buildRuleName(promptFile.pack, promptId, criterionId);

    if (violations.length > 0) {
      const violationResult = locateAndReportViolations({
        violations,
        content,
        relFile,
        severity,
        ruleName,
        scoreText: '',
        sink,
        verbose: !!verbose,
      });
      hadOperationalErrors =
        hadOperationalErrors || violationResult.hadOperationalErrors;

      if (severity === Severity.ERROR) {
        totalErrors += violations.length;
      } else {
        totalWarnings += violations.length;
      }
    }
  }

  const scoreEntry = {
    id: buildRuleName(promptFile.pack, promptId, undefined),
    scoreText: `${scored.final_score.toFixed(1)}/10`,
    score: scored.final_score,
  };

  if (debugJson) {
    writeCheckRoutingDebugArtifact({
      promptFile,
      result,
      relFile,
      decisions,
      surfacedViolations,
    });
  }

  return {
    errors: totalErrors,
    warnings: totalWarnings,
    hadOperationalErrors,
    hadSeverityErrors: severity === Severity.ERROR && totalErrors > 0,
    scoreEntries: [scoreEntry],
  };
}
