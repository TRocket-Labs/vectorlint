import { calculateCheckScore, type CheckScoringOptions } from '../scoring';
import type { CheckResult } from '../prompts/schema';
import { resolveSeverity } from './severity';
import type { RawViolation, RuleSeverity } from './types';

/** Optional scoring knobs mirroring {@link CheckScoringOptions}. */
export interface ScoreCheckOptions {
  strictness?: CheckScoringOptions['strictness'];
  promptSeverity?: RuleSeverity;
}

/**
 * The count/density score result for a rule's verified findings. Mirrors the
 * fields the processor needs to assemble a `ReviewScore`. The numeric values
 * come straight from {@link calculateCheckScore}; this layer never
 * reimplements the scoring math (audit Finding #4).
 */
export interface ScoredCheck {
  score: number;
  scoreText: string;
  severity: RuleSeverity;
  /** Count of verified findings that drove the score. */
  findingCount: number;
  /** The raw check result, used to resolve severity. */
  scored: CheckResult;
}

/**
 * Scores a rule's verified findings using the existing check density formula.
 *
 * The score is driven by the **verified** finding count, not the raw candidate
 * count (audit Finding #6): callers must pass only findings whose evidence has
 * been anchored. This is a thin adapter over {@link calculateCheckScore}; it
 * only normalizes the result into the shared score shape.
 */
export function scoreCheck(params: {
  verifiedViolations: RawViolation[];
  wordCount: number;
  strictness?: CheckScoringOptions['strictness'];
  promptSeverity?: RuleSeverity;
}): ScoredCheck {
  const scored = calculateCheckScore(
    params.verifiedViolations,
    params.wordCount,
    {
      ...(params.strictness !== undefined ? { strictness: params.strictness } : {}),
      ...(params.promptSeverity !== undefined
        ? { promptSeverity: params.promptSeverity }
        : {}),
    },
  );

  return {
    score: scored.final_score,
    scoreText: `${scored.final_score.toFixed(1)}/10`,
    severity: resolveSeverity({ scored }),
    findingCount: scored.violation_count,
    scored,
  };
}
