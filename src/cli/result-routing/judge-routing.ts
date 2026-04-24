import type { RuleCriterionSpec, RuleFile, RuleMeta } from '../../rules/rule-loader';
import type { JudgeResult } from '../../prompts/schema';
import { isJudgeResult } from '../../prompts/schema';
import { checkTarget } from '../../prompts/target';
import { Severity } from '../../schemas/rule-schemas';
import type { ScoreComponent } from '../../output/json-formatter';
import { buildRuleName, getViolationFilterResults, locateAndReportViolations } from '../issue-output';
import type { ErrorTrackingResult } from '../types';
import { writeJudgeRoutingDebugArtifact } from './debug-artifact';
import type { IssueSink } from './issue-sink';

interface ExtractCriterionParams {
  exp: RuleCriterionSpec;
  result: JudgeResult;
  content: string;
  relFile: string;
  packName: string;
  promptId: string;
  meta: RuleMeta;
  sink: IssueSink;
  verbose?: boolean;
}

interface ExtractCriterionResult extends ErrorTrackingResult {
  userScore: number;
  maxScore: number;
  scoreEntry: { id: string; scoreText: string; score?: number };
  scoreComponent?: ScoreComponent;
}

export interface RouteJudgeResultParams {
  promptFile: RuleFile;
  result: JudgeResult;
  content: string;
  relFile: string;
  sink: IssueSink;
  verbose?: boolean;
  debugJson?: boolean;
}

function validateCriteriaCompleteness(meta: RuleMeta, result: JudgeResult): boolean {
  let hadErrors = false;

  const expectedNames = new Set<string>(
    (meta.criteria || []).map((criterion) => String(criterion.name || criterion.id || ''))
  );
  const returnedNames = new Set(
    result.criteria.map((criterion: { name: string }) => criterion.name)
  );

  const expectedNormalized = new Set<string>();
  const expectedOriginalMap = new Map<string, string>();
  for (const name of expectedNames) {
    const normalized = name.toLowerCase();
    expectedNormalized.add(normalized);
    expectedOriginalMap.set(normalized, name);
  }

  const returnedNormalized = new Set<string>();
  for (const name of returnedNames) {
    returnedNormalized.add(name.toLowerCase());
  }

  for (const normalized of expectedNormalized) {
    if (!returnedNormalized.has(normalized)) {
      console.error(
        `Missing criterion in model output: ${expectedOriginalMap.get(normalized)}`
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

function validateScores(meta: RuleMeta, result: JudgeResult): boolean {
  let hadErrors = false;

  for (const exp of meta.criteria || []) {
    const nameKey = String(exp.name || exp.id || '');
    const got = result.criteria.find(
      (criterion) =>
        criterion.name === nameKey ||
        criterion.name.toLowerCase() === nameKey.toLowerCase()
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

function extractAndReportCriterion(
  params: ExtractCriterionParams
): ExtractCriterionResult {
  const {
    exp,
    result,
    content,
    relFile,
    packName,
    promptId,
    meta,
    sink,
    verbose,
  } = params;
  let hadOperationalErrors = false;
  let hadSeverityErrors = false;

  const nameKey = String(exp.name || exp.id || '');
  const criterionId = exp.id
    ? String(exp.id)
    : exp.name
      ? String(exp.name)
          .replace(/[^A-Za-z0-9]+/g, ' ')
          .split(' ')
          .filter(Boolean)
          .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
          .join('')
      : '';
  const ruleName = buildRuleName(packName, promptId, criterionId);

  const weightNum = exp.weight || 1;
  const maxScore = weightNum;

  const metaTargetSpec = meta.target;
  const expTargetSpec = exp.target;
  const targetCheck = checkTarget(content, metaTargetSpec, expTargetSpec);
  const missingTarget = targetCheck.missing;

  if (missingTarget) {
    hadSeverityErrors = true;
    const suggestion =
      targetCheck.suggestion ||
      expTargetSpec?.suggestion ||
      metaTargetSpec?.suggestion ||
      'Add the required target section.';

    sink.reportIssue({
      file: relFile,
      line: 1,
      column: 1,
      severity: Severity.ERROR,
      summary: 'target not found',
      ruleName,
      suggestion,
      scoreText: 'nil',
      match: '',
    });

    return {
      errors: 1,
      warnings: 0,
      userScore: 0,
      maxScore,
      hadOperationalErrors,
      hadSeverityErrors,
      scoreEntry: { id: ruleName, scoreText: '0.0/10', score: 0.0 },
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
    (criterion) =>
      criterion.name === nameKey ||
      criterion.name.toLowerCase() === nameKey.toLowerCase()
  );
  if (!got) {
    return {
      errors: 0,
      warnings: 0,
      userScore: 0,
      maxScore,
      hadOperationalErrors,
      hadSeverityErrors,
      scoreEntry: { id: ruleName, scoreText: '-', score: 0.0 },
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
  const rawWeighted = got.weighted_points;
  const normalizedScore = got.normalized_score;
  const userScore = rawWeighted;
  const violations = got.violations;
  const { surfacedViolations } = getViolationFilterResults(violations);
  const scoreText = `${normalizedScore.toFixed(1)}/10`;

  let errors = 0;
  let warnings = 0;

  if (surfacedViolations.length > 0) {
    let severity: Severity;
    if (score <= 1) {
      severity = Severity.ERROR;
      hadSeverityErrors = true;
      errors = surfacedViolations.length;
    } else if (score === 2) {
      severity = Severity.WARNING;
      warnings = surfacedViolations.length;
    } else {
      severity = Severity.WARNING;
      warnings = surfacedViolations.length;
    }

    const violationResult = locateAndReportViolations({
      violations: surfacedViolations,
      content,
      relFile,
      severity,
      ruleName,
      scoreText,
      sink,
      verbose: !!verbose,
    });
    hadOperationalErrors =
      hadOperationalErrors || violationResult.hadOperationalErrors;
  } else if (score <= 2) {
    const severity = score <= 1 ? Severity.ERROR : Severity.WARNING;
    if (severity === Severity.ERROR) {
      hadSeverityErrors = true;
      errors = 1;
    } else {
      warnings = 1;
    }

    const summary = got.summary.trim();
    const words = summary.split(/\s+/).filter(Boolean);
    const summaryText = words.slice(0, 15).join(' ') || 'No findings';

    sink.reportIssue({
      file: relFile,
      line: 1,
      column: 1,
      severity,
      summary: summaryText,
      ruleName,
      scoreText,
      match: '',
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
      normalizedScore,
      normalizedMaxScore: 10,
    },
  };
}

export function routeJudgeResult(
  params: RouteJudgeResultParams
): ErrorTrackingResult {
  const { promptFile, result, content, relFile, sink, verbose, debugJson } = params;
  if (!isJudgeResult(result)) {
    throw new Error('routeJudgeResult received a non-judge result');
  }

  const meta = promptFile.meta;
  const promptId = (meta.id || '').toString();

  let hadOperationalErrors = false;
  let hadSeverityErrors = false;
  let promptErrors = 0;
  let promptWarnings = 0;
  const criterionScores: Array<{ id: string; scoreText: string; score?: number }> = [];
  const scoreComponents: ScoreComponent[] = [];

  hadOperationalErrors =
    validateCriteriaCompleteness(meta, result) || hadOperationalErrors;
  hadOperationalErrors = validateScores(meta, result) || hadOperationalErrors;

  for (const exp of meta.criteria || []) {
    const criterionResult = extractAndReportCriterion({
      exp,
      result,
      content,
      relFile,
      packName: promptFile.pack,
      promptId,
      meta,
      sink,
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

  if (scoreComponents.length > 0) {
    sink.addEvaluationScore?.(relFile, {
      id: promptId || promptFile.filename.replace(/\.md$/, ''),
      scores: scoreComponents,
    });
  }

  if (debugJson) {
    writeJudgeRoutingDebugArtifact({ promptFile, result, relFile });
  }

  return {
    errors: promptErrors,
    warnings: promptWarnings,
    hadOperationalErrors,
    hadSeverityErrors,
    scoreEntries: criterionScores,
  };
}
