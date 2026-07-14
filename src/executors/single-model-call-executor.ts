import path from 'path';

import type { ReviewExecutor } from '../review/executor';
import { BudgetExceededError, enforceBudget } from '../review/budget';
import type {
  ReviewDiagnostic,
  ReviewFinding,
  ReviewRequest,
  ReviewResult,
  ReviewRule,
  ReviewScore,
  ReviewUsage,
} from '../review/types';
import type { EvalContext } from '../providers/request-builder';
import type { StructuredModelClient } from '../providers/structured-model-client';
import { Severity } from '../evaluators/types';
import { buildCheckLLMSchema, type CheckLLMResult } from '../prompts/schema';
import { countWords, mergeViolations, RecursiveChunker, type Chunk } from '../chunking';
import { prependLineNumbers } from '../output/line-numbering';
import { processFindings } from '../findings';

/**
 * Word-count threshold above which the single-call executor chunks the target
 * before reviewing it. Mirrors the check evaluator's chunking threshold so the
 * single-call path preserves the existing chunk/merge behavior for large
 * documents.
 */
const CHUNKING_WORD_THRESHOLD = 600;
const MAX_CHUNK_WORDS = 500;

/**
 * Stable diagnostic code recorded when a run stops because the model-call
 * budget was exhausted before every rule could be reviewed.
 */
const REVIEW_BUDGET_EXCEEDED_CODE = 'review-budget-exceeded';

/**
 * Mutable run-wide counters shared across rules and chunks.
 */
interface RunCounters {
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * The single modelCall {@link ReviewExecutor} (audit Finding #2).
 *
 * Reviews target content against source-backed rules with one structured model
 * call per (rule, chunk) through an injected {@link StructuredModelClient}. It
 * owns no tool surface and no autonomous loop: rule prompts come verbatim from
 * {@link ReviewRule.body}, candidate findings flow through the shared
 * {@link processFindings} pipeline, and the model-call budget is enforced via
 * the review budget module before every call.
 *
 * This is the bounded, transport-only review strategy selected by
 * `--model-call single` (and by `auto` for normal-sized inputs).
 */
export class SingleModelCallExecutor implements ReviewExecutor {
  constructor(private readonly client: StructuredModelClient) {}

  async run(request: ReviewRequest): Promise<ReviewResult> {
    const schema = buildCheckLLMSchema();
    const context = this.buildContext(request.target.uri);

    const findings: ReviewFinding[] = [];
    const scores: ReviewScore[] = [];
    const diagnostics: ReviewDiagnostic[] = [];
    let hadOperationalErrors = false;

    const counters: RunCounters = { modelCalls: 0, inputTokens: 0, outputTokens: 0 };
    const startedAt = Date.now();
    const elapsedMs = () => Date.now() - startedAt;

    try {
      for (const rule of request.rules) {
        const ruleResult = await this.reviewRule(
          request,
          rule,
          schema,
          context,
          counters,
          elapsedMs,
        );
        findings.push(...ruleResult.findings);
        scores.push(...ruleResult.scores);
        diagnostics.push(...ruleResult.diagnostics);
        if (ruleResult.hadOperationalErrors) {
          hadOperationalErrors = true;
        }
      }
    } catch (error: unknown) {
      if (error instanceof BudgetExceededError) {
        // Surface the existing budget error pattern as an operational failure:
        // the run returns partial results plus an error diagnostic rather than
        // throwing past the ReviewExecutor contract.
        hadOperationalErrors = true;
        diagnostics.push({
          level: 'error',
          code: REVIEW_BUDGET_EXCEEDED_CODE,
          message: error.message,
          context: { limit: error.limit, actual: error.actual },
        });
      } else {
        throw error;
      }
    }

    return {
      findings,
      scores,
      diagnostics,
      hadOperationalErrors,
      usage: this.buildUsage(request, counters, elapsedMs()),
    };
  }

  /**
   * Reviews a single rule: chunks the line-numbered target, makes one
   * structured model call per chunk, merges violations across chunks, and
   * projects the merged candidates through {@link processFindings}.
   */
  private async reviewRule(
    request: ReviewRequest,
    rule: ReviewRule,
    schema: ReturnType<typeof buildCheckLLMSchema>,
    context: EvalContext,
    counters: RunCounters,
    elapsedMs: () => number,
  ): Promise<ReviewResult> {
    const numberedContent = prependLineNumbers(request.target.content);
    const wordCount = countWords(request.target.content) || 1;
    const chunks = this.chunkTarget(numberedContent, wordCount, request.budget.maxChunksPerRule);

    const chunkViolations: CheckLLMResult['violations'][] = [];
    for (const chunk of chunks) {
      // Enforce the model-call budget before committing to another call. The
      // prospective count (calls made so far plus this one) lets enforceBudget
      // reject the call that would push the run over maxModelCallsPerReview.
      enforceBudget(request.budget, {
        modelCalls: counters.modelCalls + 1,
        elapsedMs: elapsedMs(),
      });

      const { data, usage } = await this.client.runPromptStructured<CheckLLMResult>(
        chunk.content,
        rule.body,
        schema,
        context,
      );
      counters.modelCalls += 1;
      if (usage) {
        counters.inputTokens += usage.inputTokens;
        counters.outputTokens += usage.outputTokens;
      }
      chunkViolations.push(data.violations);
    }

    const { pack, ruleId } = splitRuleId(rule.id);
    const mergedViolations = mergeViolations(chunkViolations);

    return processFindings({
      pack,
      ruleId,
      ruleSource: rule.source,
      candidateFindings: mergedViolations,
      wordCount,
      // Map the review contract's plain severity union onto the finding
      // processor's Severity enum at this boundary.
      promptMeta: {
        ...(rule.severity !== undefined
          ? { severity: rule.severity === 'error' ? Severity.ERROR : Severity.WARNING }
          : {}),
      },
      targetContent: request.target.content,
    });
  }

  /**
   * Chunks line-numbered target content for context management. Small targets
   * review as a single chunk; larger targets are split recursively and capped
   * at the review budget's per-rule chunk limit.
   */
  private chunkTarget(
    numberedContent: string,
    wordCount: number,
    maxChunks: number,
  ): Chunk[] {
    if (wordCount <= CHUNKING_WORD_THRESHOLD) {
      return [{ content: numberedContent, index: 0 }];
    }
    const chunker = new RecursiveChunker();
    return chunker.chunk(numberedContent, { maxChunkSize: MAX_CHUNK_WORDS }).slice(0, maxChunks);
  }

  private buildContext(uri: string): EvalContext {
    const ext = path.extname(uri);
    return ext ? { fileType: ext } : {};
  }

  private buildUsage(
    request: ReviewRequest,
    counters: RunCounters,
    wallClockMs: number,
  ): ReviewUsage {
    const usage: ReviewUsage = { modelCalls: counters.modelCalls, wallClockMs };
    if (request.outputPolicy.includeUsage) {
      usage.inputTokens = counters.inputTokens;
      usage.outputTokens = counters.outputTokens;
    }
    return usage;
  }
}

/**
 * Splits a `Pack.RuleId` review rule id into its `pack` and `ruleId` parts.
 * The review contract carries the composite id, while {@link processFindings}
 * rebuilds the same id from the parts via `buildRuleId`. Splits on the first
 * dot; pack names are single path segments and rule ids are PascalCase.
 */
function splitRuleId(id: string): { pack: string; ruleId: string } {
  const dot = id.indexOf('.');
  if (dot === -1) {
    return { pack: id, ruleId: id };
  }
  return { pack: id.slice(0, dot), ruleId: id.slice(dot + 1) };
}
