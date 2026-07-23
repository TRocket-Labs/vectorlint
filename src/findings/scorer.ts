import { calculateScore, type ScoringOptions } from '../scoring';
import type { ScoredReview } from '../prompts/schema';
import { resolveSeverity } from './severity';
import type { RawViolation, RuleSeverity } from './types';

export interface ScoreOptions {
  strictness?: ScoringOptions['strictness'];
  promptSeverity?: RuleSeverity;
}

export interface ScoredFindings {
  score: number;
  scoreText: string;
  severity: RuleSeverity;
  findingCount: number;
  scored: ScoredReview;
}

/** Scores verified findings using violation density. */
export function scoreFindings(params: {
  verifiedViolations: RawViolation[];
  wordCount: number;
  strictness?: ScoringOptions['strictness'];
  promptSeverity?: RuleSeverity;
}): ScoredFindings {
  const scored = calculateScore(
    params.verifiedViolations,
    Math.max(1, params.wordCount),
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
