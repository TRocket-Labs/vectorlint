import { randomUUID } from 'crypto';
import type {
  ErrorTrackingResult,
  ProcessCriterionParams,
  ProcessCriterionResult,
  ProcessPromptResultParams,
  ValidationParams,
} from './types';
import { OutputFormat } from './types';
import { Severity } from '../evaluators/types';
import { computeFilterDecision } from '../evaluators/violation-filter';
import { JsonFormatter, type ScoreComponent } from '../output/json-formatter';
import { RdJsonFormatter } from '../output/rdjson-formatter';
import { checkTarget } from '../prompts/target';
import { isJudgeResult } from '../prompts/schema';
import { calculateCheckScore } from '../scoring';
import { writeDebugRunArtifact } from '../debug/run-artifact';
import {
  buildRuleName,
  getViolationFilterResults,
  locateAndReportViolations,
  reportIssue,
} from './issue-reporter';

function getModelInfoFromEnv(): { provider?: string; name?: string; tag?: string } {
  const provider = process.env.LLM_PROVIDER;
  let name: string | undefined;

  switch (provider) {
    case 'openai':
      name = process.env.OPENAI_MODEL;
      break;
    case 'anthropic':
      name = process.env.ANTHROPIC_MODEL;
      break;
    case 'azure-openai':
      name = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
      break;
    case 'gemini':
      name = process.env.GEMINI_MODEL;
      break;
  }

  const tag = [provider, name].filter(Boolean).join('-');
  return { ...(provider && { provider }), ...(name && { name }), ...(tag && { tag }) };
}

/*
 * Extracts pre-calculated scores from a subjective evaluation criterion and reports surfaced violations.
 * Violations that do not pass computeFilterDecision are not reported.
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
    packName,
    promptId,
    meta,
    outputFormat,
    jsonFormatter,
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
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join('')
      : '';
  const ruleName = buildRuleName(packName, promptId, criterionId);

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
    const suggestion =
      targetCheck.suggestion ||
      expTargetSpec?.suggestion ||
      metaTargetSpec?.suggestion ||
      'Add the required target section.';
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

  // Use pre-calculated values from evaluator
  const rawWeighted = got.weighted_points;
  const normalizedScore = got.normalized_score;
  const userScore = rawWeighted;
  const violations = got.violations;
  const { surfacedViolations } = getViolationFilterResults(violations);

  // Display normalized score (1-10) in CLI output
  const scoreText = `${normalizedScore.toFixed(1)}/10`;

  // Determine severity based on violations
  // If there are violations, use evaluator's scoring to determine severity
  // Score <= 1 = error, score = 2 = warning, score > 2 = no severity needed (but we still create scoreEntry)
  let errors = 0;
  let warnings = 0;
  let severity: Severity | undefined;

  if (surfacedViolations.length > 0) {
    // Determine severity from score for violations
    if (score <= 1) {
      severity = Severity.ERROR;
      hadSeverityErrors = true;
      errors = surfacedViolations.length;
    } else if (score === 2) {
      severity = Severity.WARNING;
      warnings = surfacedViolations.length;
    } else {
      // Score > 2 but has violations - this is informational
      // Use WARNING as default for informational violations
      severity = Severity.WARNING;
      warnings = surfacedViolations.length;
    }

    // Report surfaced violations only
    const violationResult = locateAndReportViolations({
      violations: surfacedViolations as Array<{
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
    const limited = words.slice(0, 15).join(' ');
    const summaryText = limited || 'No findings';
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
    (meta.criteria || []).map((c) => String(c.name || c.id || ''))
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
    const nameKey = String(exp.name || exp.id || '');
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
 * Routes evaluation results through check or judge processing paths.
 * Check: Reports violations, creates scoreEntry using final_score.
 * Judge: Iterates through criteria, validates scores, creates scoreEntry per criterion.
 * Both paths generate scoreEntries for Quality Scores display.
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
  const meta = promptFile.meta;
  const promptId = (meta.id || '').toString();

  let hadOperationalErrors = false;
  let hadSeverityErrors = false;
  let promptErrors = 0;
  let promptWarnings = 0;

  // Handle Check Result
  if (!isJudgeResult(result)) {
    const { decisions, surfacedViolations } = getViolationFilterResults(
      result.violations
    );

    // Score calculated from surfaced violations only - matches what user sees
    const scored = calculateCheckScore(
      surfacedViolations,
      result.word_count,
      {
        strictness: promptFile.meta.strictness,
        promptSeverity: promptFile.meta.severity,
      }
    );
    const severity = scored.severity;
    // Group violations by criterionName
    const violationsByCriterion = new Map<
      string | undefined,
      typeof surfacedViolations
    >();
    for (const v of surfacedViolations) {
      const criterionName = v.criterionName;
      if (!violationsByCriterion.has(criterionName)) {
        violationsByCriterion.set(criterionName, []);
      }
      violationsByCriterion.get(criterionName)!.push(v);
    }

    // Report violations grouped by criterion
    let totalErrors = 0;
    let totalWarnings = 0;

    for (const [criterionName, violations] of violationsByCriterion) {
      // Find criterion ID from meta
      let criterionId: string | undefined;
      if (criterionName && meta.criteria) {
        const criterion = meta.criteria.find(c => c.name === criterionName);
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
          outputFormat,
          jsonFormatter,
          verbose: !!verbose,
        });
        hadOperationalErrors = hadOperationalErrors || violationResult.hadOperationalErrors;

        if (severity === Severity.ERROR) {
          totalErrors += violations.length;
        } else {
          totalWarnings += violations.length;
        }
      }
    }

    // Create scoreEntry for Quality Scores display
    const scoreEntry = {
      id: buildRuleName(promptFile.pack, promptId, undefined),
      scoreText: `${scored.final_score.toFixed(1)}/10`,
      score: scored.final_score,
    };

    if (debugJson) {
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
            evaluation_type: 'check',
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
      hadOperationalErrors,
      hadSeverityErrors: severity === Severity.ERROR && totalErrors > 0,
      scoreEntries: [scoreEntry],
    };
  }

  // Handle Judge Result
  // Validate criterion completeness and scores
  hadOperationalErrors =
    validateCriteriaCompleteness({ meta, result }) || hadOperationalErrors;
  hadOperationalErrors =
    validateScores({ meta, result }) || hadOperationalErrors;

  // Reset promptErrors and promptWarnings for subjective results
  promptErrors = 0;
  promptWarnings = 0;
  const criterionScores: Array<{ id: string; scoreText: string; score?: number }> = [];
  const scoreComponents: ScoreComponent[] = [];

  // Iterate through each criterion
  for (const exp of meta.criteria || []) {
    const criterionResult = extractAndReportCriterion({
      exp,
      result,
      content,
      relFile,
      packName: promptFile.pack,
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
        id: promptId || promptFile.filename.replace(/\.md$/, ''),
        scores: scoreComponents,
      }
    );
  }

  if (debugJson) {
    const runId = randomUUID();
    const flat = result.criteria.flatMap((c) =>
      (c.violations || []).map((v, i) => ({
        criterion: c.name,
        index: i,
        violation: v,
        decision: computeFilterDecision(v),
      }))
    );
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
          evaluation_type: 'judge',
        },
        raw_model_output: (result as { raw_model_output?: unknown }).raw_model_output ?? null,
        filter_decisions: flat.map((x) => ({
          criterion: x.criterion,
          index: x.index,
          surface: x.decision.surface,
          reasons: x.decision.reasons,
        })),
        surfaced_violations: flat.filter((x) => x.decision.surface).map((x) => ({
          criterion: x.criterion,
          violation: x.violation,
        })),
      });
      console.warn(`[vectorlint] Debug JSON written: ${filePath}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[vectorlint] Debug JSON write failed: ${message}`);
    }
  }

  return {
    errors: promptErrors,
    warnings: promptWarnings,
    hadOperationalErrors,
    hadSeverityErrors,
    scoreEntries: criterionScores,
  };
}
