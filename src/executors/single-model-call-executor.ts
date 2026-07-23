import type { ReviewExecutor } from '../review/executor';
import { enforceBudget } from '../review/budget';
import type {
  ReviewDiagnostic,
  ReviewFinding,
  ReviewRequest,
  ReviewResult,
  ReviewRule,
  ReviewScore,
} from '../review/types';
import type { ReviewCallContext } from '../providers/request-builder';
import type { StructuredModelClient } from '../providers/structured-model-client';
import {
  buildReviewLLMSchema,
  type ReviewLLMResult,
} from '../prompts/schema';
import { countWords, mergeViolations, RecursiveChunker, type Chunk } from '../chunking';
import { prependLineNumbers } from '../output/line-numbering';
import { processFindings } from '../findings';
import {
  budgetExceededDiagnostic,
  buildReviewCallContext,
  buildReviewPrompt,
  buildReviewUsage,
  splitRuleId,
  toFindingSeverity,
  type RunCounters,
} from './shared';

/**
 * Word-count threshold above which the single-call executor chunks the target
 * before reviewing it. The threshold preserves the existing chunk/merge
 * behavior for large documents.
 */
const CHUNKING_WORD_THRESHOLD = 600;
const MAX_CHUNK_WORDS = 500;

/**
 * The single modelCall {@link ReviewExecutor}.
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
    const schema = buildReviewLLMSchema();
    const context = {
      ...buildReviewCallContext(request.target.uri),
      recordPayloadTelemetry: request.outputPolicy.recordPayloadTelemetry,
    };

    const findings: ReviewFinding[] = [];
    const scores: ReviewScore[] = [];
    const diagnostics: ReviewDiagnostic[] = [];
    let hadOperationalErrors = false;

    const counters: RunCounters = { modelCalls: 0, inputTokens: 0, outputTokens: 0 };
    const startedAt = Date.now();
    const elapsedMs = () => Date.now() - startedAt;

    try {
      for (const rule of request.rules) {
        const contentReview = await this.reviewTargetWithRule(
          request,
          rule,
          schema,
          context,
          counters,
          elapsedMs,
        );
        findings.push(...contentReview.findings);
        scores.push(...contentReview.scores);
        diagnostics.push(...contentReview.diagnostics);
        if (contentReview.hadOperationalErrors) {
          hadOperationalErrors = true;
        }
      }
    } catch (error: unknown) {
      // Surface budget exhaustion as an operational failure: the run returns
      // partial results plus an error diagnostic rather than throwing past the
      // ReviewExecutor contract. Non-budget errors propagate unchanged.
      const diagnostic = budgetExceededDiagnostic(error);
      if (diagnostic) {
        hadOperationalErrors = true;
        diagnostics.push(diagnostic);
      } else {
        throw error;
      }
    }

    return {
      findings,
      scores,
      diagnostics,
      hadOperationalErrors,
      usage: buildReviewUsage(request, counters, elapsedMs()),
    };
  }

  /**
   * Reviews a single rule: chunks the line-numbered target, makes one
   * structured model call per chunk, merges violations across chunks, and
   * projects the merged candidates through {@link processFindings}.
   */
  private async reviewTargetWithRule(
    request: ReviewRequest,
    rule: ReviewRule,
    schema: ReturnType<typeof buildReviewLLMSchema>,
    context: ReviewCallContext,
    counters: RunCounters,
    elapsedMs: () => number,
  ): Promise<ReviewResult> {
    const numberedContent = prependLineNumbers(request.target.content);
    const wordCount = countWords(request.target.content) || 1;
    const chunks = this.chunkTarget(numberedContent, wordCount, request.budget.maxChunksPerRule);
    const reviewPrompt = buildReviewPrompt(rule.body, request.context);

    const chunkViolations: ReviewLLMResult['violations'][] = [];
    for (const chunk of chunks) {
      // Enforce the model-call budget before committing to another call. The
      // prospective count (calls made so far plus this one) lets enforceBudget
      // reject the call that would push the run over maxModelCallsPerReview.
      enforceBudget(request.budget, {
        modelCalls: counters.modelCalls + 1,
        elapsedMs: elapsedMs(),
      });

      const { data, usage } = await this.client.runPromptStructured<ReviewLLMResult>(
        chunk.content,
        reviewPrompt,
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
      promptMeta: {
        ...(rule.severity !== undefined ? { severity: toFindingSeverity(rule.severity) } : {}),
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
}
