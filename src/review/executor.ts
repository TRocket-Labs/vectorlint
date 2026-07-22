import type { ReviewModelCall, ReviewRequest, ReviewResult } from './types';

/**
 * Above this target byte size (roughly the existing chunking threshold in
 * bytes), `auto` model-call selection prefers the agent executor so the
 * reviewer can page through target content for context management.
 */
export const AGENT_MODEL_CALL_BYTE_THRESHOLD = 600_000;

/**
 * The single source of truth for reviewer model-call strategies. Kept in sync
 * with the {@link ReviewModelCall} union via `satisfies`.
 */
export const REVIEW_MODEL_CALLS = ['single', 'agent', 'auto'] as const satisfies readonly ReviewModelCall[];

/**
 * The stable domain-level interface every executor implements. Single and
 * agent executors are implementations behind this contract.
 */
export interface ReviewExecutor {
  run(request: ReviewRequest): Promise<ReviewResult>;
}

/**
 * Agent-call capability: a bounded way to page through target content for
 * context management. NOT a workspace tool. An agent
 * executor receives this capability scoped to the target only.
 */
export interface ReviewTargetReadCapability {
  /** Read a 1-based [startLine, endLine] window of the target content. */
  readTargetSection(
    startLine: number,
    endLine: number,
  ): Promise<{ startLine: number; endLine: number; content: string }>;
}

/**
 * Resolves 'auto' to 'single' or 'agent'. Single for normal-sized inputs;
 * agent for large inputs or multi-rule runs that benefit from paging.
 */
export function chooseModelCall(
  modelCall: ReviewModelCall,
  signal: { targetBytes: number; rules: number },
): 'single' | 'agent' {
  if (modelCall === 'single') return 'single';
  if (modelCall === 'agent') return 'agent';
  if (signal.targetBytes > AGENT_MODEL_CALL_BYTE_THRESHOLD || signal.rules > 5) {
    return 'agent';
  }
  return 'single';
}
